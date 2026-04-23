#include <napi.h>

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <QuartzCore/QuartzCore.h>
#import <WebKit/WebKit.h>

class PanelBridgeCallback {
 public:
  PanelBridgeCallback() = default;
  ~PanelBridgeCallback() {
    Clear();
  }

  bool Set(Napi::Env env, const Napi::Function& callback) {
    Clear();
    tsfn_ = Napi::ThreadSafeFunction::New(env, callback, "macos-overlay-panel-callback", 0, 1);
    hasCallback_ = true;
    return true;
  }

  void Clear() {
    if (!hasCallback_) {
      return;
    }

    tsfn_.Release();
    hasCallback_ = false;
  }

  void Emit(NSString* message) {
    if (!hasCallback_ || message == nil) {
      return;
    }

    const char* utf8 = [message UTF8String];
    if (utf8 == nullptr) {
      return;
    }

    auto* payload = new std::string(utf8);
    napi_status status = tsfn_.BlockingCall(payload, [](Napi::Env env, Napi::Function jsCallback, std::string* value) {
      jsCallback.Call({Napi::String::New(env, *value)});
      delete value;
    });

    if (status != napi_ok) {
      delete payload;
    }
  }

 private:
  Napi::ThreadSafeFunction tsfn_;
  bool hasCallback_ = false;
};

@interface OverlayPanelRecord : NSObject
@property(nonatomic, retain) NSPanel* panel;
@property(nonatomic, retain) NSView* containerView;
@property(nonatomic, retain) WKWebView* webView;
@property(nonatomic, retain) id localMouseMonitor;
@property(nonatomic, retain) id globalMouseMonitor;
@property(nonatomic, assign) BOOL webViewLoaded;
@property(nonatomic, assign) BOOL bridgeReady;
@property(nonatomic, assign) BOOL pointerInside;
@property(nonatomic, copy) NSString* currentURL;
@property(nonatomic, copy) NSString* currentCursorStyle;
@property(nonatomic, assign) PanelBridgeCallback* callback;
@end

@implementation OverlayPanelRecord
- (void)dealloc {
  if (_localMouseMonitor != nil) {
    [NSEvent removeMonitor:_localMouseMonitor];
    [_localMouseMonitor release];
    _localMouseMonitor = nil;
  }

  if (_globalMouseMonitor != nil) {
    [NSEvent removeMonitor:_globalMouseMonitor];
    [_globalMouseMonitor release];
    _globalMouseMonitor = nil;
  }

  [_currentURL release];
  _currentURL = nil;

  [_currentCursorStyle release];
  _currentCursorStyle = nil;

  [super dealloc];
}
@end

@interface OverlayTrackingView : NSView
@property(nonatomic, assign) OverlayPanelRecord* record;
- (void)syncPointerState;
@end

@interface OverlayWebView : WKWebView
@property(nonatomic, assign) OverlayPanelRecord* record;
@end

@interface OverlayPanel : NSPanel
@end

static void ApplyCursorStyle(OverlayPanelRecord* record, NSString* cursorStyle);
static NSCursor* CursorForStyle(NSString* cursorStyle);
static void RefreshCursorForRecord(OverlayPanelRecord* record);
static void ScheduleCursorRefreshForRecord(OverlayPanelRecord* record);

static const CGFloat kCompactIslandWidth = 480.0;
static const CGFloat kExpandedIslandWidth = 600.0;
static const CGFloat kCompactTopInset = kCompactIslandWidth * 0.11;
static const CGFloat kCompactTopDepth = 32.0 * 0.3125;
static const CGFloat kCompactBottomInset = kCompactIslandWidth * 0.135;
static const CGFloat kCompactBottomDepth = 32.0 * 0.3125;

@implementation OverlayTrackingView {
  NSTrackingArea* _trackingArea;
  CAShapeLayer* _shapeMaskLayer;
}

- (void)dealloc {
  if (_trackingArea != nil) {
    [self removeTrackingArea:_trackingArea];
    [_trackingArea release];
    _trackingArea = nil;
  }

  if (_shapeMaskLayer != nil) {
    [_shapeMaskLayer release];
    _shapeMaskLayer = nil;
  }

  [super dealloc];
}

- (void)updateTrackingAreas {
  if (_trackingArea != nil) {
    [self removeTrackingArea:_trackingArea];
    [_trackingArea release];
    _trackingArea = nil;
  }

  _trackingArea = [[NSTrackingArea alloc] initWithRect:NSZeroRect
                                               options:(NSTrackingMouseEnteredAndExited |
                                                        NSTrackingActiveAlways |
                                                        NSTrackingInVisibleRect)
                                                 owner:self
                                              userInfo:nil];
  [self addTrackingArea:_trackingArea];
  [super updateTrackingAreas];
}

- (void)syncVisibleShapeMask {
  if (![self wantsLayer]) {
    return;
  }

  CALayer* layer = [self layer];
  if (layer == nil) {
    return;
  }

  CGPathRef path = [self copyVisibleShapePath];
  if (_shapeMaskLayer == nil) {
    _shapeMaskLayer = [[CAShapeLayer alloc] init];
    _shapeMaskLayer.fillColor = [[NSColor blackColor] CGColor];
  }

  _shapeMaskLayer.frame = self.bounds;
  _shapeMaskLayer.path = path;
  _shapeMaskLayer.contentsScale = self.window != nil ? self.window.backingScaleFactor : NSScreen.mainScreen.backingScaleFactor;
  layer.mask = _shapeMaskLayer;
  CGPathRelease(path);
}

- (void)layout {
  [super layout];
  [self syncVisibleShapeMask];
}

- (void)setFrameSize:(NSSize)newSize {
  [super setFrameSize:newSize];
  [self syncVisibleShapeMask];
}

- (CGPathRef)copyVisibleShapePath CF_RETURNS_RETAINED {
  const CGRect bounds = NSRectToCGRect(self.bounds);
  const CGFloat width = CGRectGetWidth(bounds);
  const CGFloat height = CGRectGetHeight(bounds);
  CGMutablePathRef path = CGPathCreateMutable();

  if (width <= 0.0 || height <= 0.0) {
    return path;
  }

  const CGFloat safeWidth = MAX(width, 1.0);
  const CGFloat safeHeight = MAX(height, 1.0);
  const CGFloat widthRange = kExpandedIslandWidth - kCompactIslandWidth;
  const CGFloat morphProgress = widthRange <= 0.0
    ? 1.0
    : MAX(0.0, MIN(1.0, (safeWidth - kCompactIslandWidth) / widthRange));
  const CGFloat easedCornerProgress = pow(morphProgress, 0.72);
  const CGFloat expandedScale = MIN(1.0, safeHeight / 58.0);
  const CGFloat expandedTopInset = 22.0 * expandedScale;
  const CGFloat expandedTopDepth = 22.0 * expandedScale;
  const CGFloat expandedBottomInset = 34.0 * expandedScale;
  const CGFloat expandedBottomDepth = 18.0 * expandedScale;
  const CGFloat topInset = kCompactTopInset + ((expandedTopInset - kCompactTopInset) * morphProgress);
  const CGFloat topDepth = kCompactTopDepth + ((expandedTopDepth - kCompactTopDepth) * easedCornerProgress);
  const CGFloat bottomInset = kCompactBottomInset + ((expandedBottomInset - kCompactBottomInset) * easedCornerProgress);
  const CGFloat animatedBottomDepth = kCompactBottomDepth + ((expandedBottomDepth - kCompactBottomDepth) * easedCornerProgress);
  const CGFloat bottomDepth = MAX(animatedBottomDepth, safeHeight * 0.05);
  const CGFloat rightTopInset = safeWidth - topInset;
  const CGFloat rightBottomInset = safeWidth - bottomInset;
  const CGFloat bottomStartY = MAX(topDepth, safeHeight - bottomDepth);

  CGFloat (^viewY)(CGFloat) = ^CGFloat(CGFloat topFraction) {
    return height * (1.0 - topFraction);
  };

  CGPathMoveToPoint(path, nullptr, 0.0, viewY(0.0));
  CGPathAddQuadCurveToPoint(path, nullptr, topInset, viewY(0.0), topInset, safeHeight - topDepth);
  CGPathAddLineToPoint(path, nullptr, topInset, safeHeight - bottomStartY);
  CGPathAddQuadCurveToPoint(path, nullptr, topInset, viewY(1.0), bottomInset, viewY(1.0));
  CGPathAddLineToPoint(path, nullptr, rightBottomInset, viewY(1.0));
  CGPathAddQuadCurveToPoint(path, nullptr, rightTopInset, viewY(1.0), rightTopInset, safeHeight - bottomStartY);
  CGPathAddLineToPoint(path, nullptr, rightTopInset, safeHeight - topDepth);
  CGPathAddQuadCurveToPoint(path, nullptr, rightTopInset, viewY(0.0), safeWidth, viewY(0.0));

  CGPathCloseSubpath(path);
  return path;
}

- (BOOL)isLocalPointInsideVisibleShape:(NSPoint)localPoint {
  if (self.record == nil) {
    return NO;
  }

  if (!NSPointInRect(localPoint, self.bounds)) {
    return NO;
  }

  CGPathRef path = [self copyVisibleShapePath];
  const BOOL isInside = CGPathContainsPoint(path, nullptr, CGPointMake(localPoint.x, localPoint.y), false);
  CGPathRelease(path);
  return isInside;
}

- (BOOL)currentMouseIsInsideVisibleShape {
  if (self.record == nil || self.record.panel == nil) {
    return NO;
  }

  const NSPoint screenPoint = [NSEvent mouseLocation];
  const NSRect frame = [self.record.panel frame];
  if (!NSPointInRect(screenPoint, frame)) {
    return NO;
  }

  const NSPoint windowPoint = [self.record.panel convertPointFromScreen:screenPoint];
  const NSPoint localPoint = [self convertPoint:windowPoint fromView:nil];
  return [self isLocalPointInsideVisibleShape:localPoint];
}

- (void)syncPointerState {
  if (self.record == nil || self.record.panel == nil) {
    return;
  }

  const BOOL inside = [self currentMouseIsInsideVisibleShape];
  [self.record.panel setIgnoresMouseEvents:inside ? NO : YES];
  if (inside && ![self.record.panel isKeyWindow]) {
    [self.record.panel makeKeyWindow];
  }
  if (!inside) {
    ApplyCursorStyle(self.record, @"default");
  }

  if (self.record.callback == nullptr || self.record.pointerInside == inside) {
    self.record.pointerInside = inside;
    return;
  }

  self.record.pointerInside = inside;
  self.record.callback->Emit(
    inside
      ? @"{\"kind\":\"event\",\"channel\":\"native:hover\",\"payload\":{\"inside\":true}}"
      : @"{\"kind\":\"event\",\"channel\":\"native:hover\",\"payload\":{\"inside\":false}}"
  );
}

- (void)mouseEntered:(NSEvent*)event {
  [self syncPointerState];
  ScheduleCursorRefreshForRecord(self.record);
}

- (void)mouseExited:(NSEvent*)event {
  [self syncPointerState];
  ScheduleCursorRefreshForRecord(self.record);
}

- (BOOL)acceptsFirstMouse:(NSEvent*)event {
  return YES;
}
@end

@implementation OverlayWebView

- (BOOL)acceptsFirstMouse:(NSEvent*)event {
  return YES;
}

- (void)resetCursorRects {
  [super resetCursorRects];

  NSString* cursorStyle = self.record != nil ? self.record.currentCursorStyle : @"default";
  [self addCursorRect:self.bounds cursor:CursorForStyle(cursorStyle)];
}

- (void)cursorUpdate:(NSEvent*)event {
  NSString* cursorStyle = self.record != nil ? self.record.currentCursorStyle : @"default";
  [CursorForStyle(cursorStyle) set];
}

@end

@implementation OverlayPanel

- (BOOL)canBecomeKeyWindow {
  return YES;
}

- (BOOL)canBecomeMainWindow {
  return NO;
}

@end

@interface OverlayBridgeScriptHandler : NSObject <WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, assign) OverlayPanelRecord* record;
@end

static NSCursor* CursorForStyle(NSString* cursorStyle) {
  if (cursorStyle == nil) {
    return [NSCursor arrowCursor];
  }

  NSString* normalized = [[cursorStyle lowercaseString] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];

  if ([normalized isEqualToString:@"pointer"]) {
    return [NSCursor pointingHandCursor];
  }

  if (
    [normalized isEqualToString:@"text"]
    || [normalized isEqualToString:@"vertical-text"]
  ) {
    return [NSCursor IBeamCursor];
  }

  if (
    [normalized isEqualToString:@"not-allowed"]
    || [normalized isEqualToString:@"no-drop"]
  ) {
    return [NSCursor operationNotAllowedCursor];
  }

  if ([normalized isEqualToString:@"crosshair"]) {
    return [NSCursor crosshairCursor];
  }

  if ([normalized isEqualToString:@"grab"]) {
    return [NSCursor openHandCursor];
  }

  if ([normalized isEqualToString:@"grabbing"]) {
    return [NSCursor closedHandCursor];
  }

  return [NSCursor arrowCursor];
}

static void RefreshCursorForRecord(OverlayPanelRecord* record) {
  if (record == nil) {
    return;
  }

  if (!record.pointerInside) {
    [[NSCursor arrowCursor] set];
    return;
  }

  [CursorForStyle(record.currentCursorStyle) set];
}

static void ScheduleCursorRefreshForRecord(OverlayPanelRecord* record) {
  if (record == nil) {
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    RefreshCursorForRecord(record);
  });
}

static void ApplyCursorStyle(OverlayPanelRecord* record, NSString* cursorStyle) {
  if (record == nil || record.panel == nil) {
    return;
  }

  NSString* normalized = cursorStyle != nil ? [[cursorStyle lowercaseString] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] : @"default";
  if (record.currentCursorStyle != nil && [record.currentCursorStyle isEqualToString:normalized]) {
    return;
  }

  record.currentCursorStyle = normalized;
  if ([record.webView isKindOfClass:[OverlayWebView class]]) {
    OverlayWebView* webView = (OverlayWebView*)record.webView;
    [[webView window] invalidateCursorRectsForView:webView];
  }
  ScheduleCursorRefreshForRecord(record);
}

@implementation OverlayBridgeScriptHandler

- (void)userContentController:(WKUserContentController*)userContentController didReceiveScriptMessage:(WKScriptMessage*)message {
  if (self.record == nil || self.record.callback == nullptr) {
    return;
  }

  NSString* body = nil;
  if ([message.body isKindOfClass:[NSString class]]) {
    body = (NSString*)message.body;
  } else {
    NSError* error = nil;
    NSData* jsonData = [NSJSONSerialization dataWithJSONObject:message.body options:0 error:&error];
    if (jsonData != nil && error == nil) {
      body = [[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] autorelease];
    }
  }

  if (body == nil) {
    return;
  }

  NSData* data = [body dataUsingEncoding:NSUTF8StringEncoding];
  if (data != nil) {
    NSError* error = nil;
    id json = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (error == nil && [json isKindOfClass:[NSDictionary class]]) {
      NSString* kind = [(NSDictionary*)json objectForKey:@"kind"];
      NSString* channel = [(NSDictionary*)json objectForKey:@"channel"];
      if ([kind isEqualToString:@"event"] && [channel isEqualToString:@"bridge-ready"]) {
        self.record.bridgeReady = YES;
      }
      if ([kind isEqualToString:@"event"] && [channel isEqualToString:@"native:set-cursor"]) {
        id payload = [(NSDictionary*)json objectForKey:@"payload"];
        NSString* cursor = [payload isKindOfClass:[NSDictionary class]] ? [(NSDictionary*)payload objectForKey:@"cursor"] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
          ApplyCursorStyle(self.record, [cursor isKindOfClass:[NSString class]] ? cursor : @"default");
        });
      }
    }
  }

  self.record.callback->Emit(body);
}

- (void)webView:(WKWebView*)webView didFinishNavigation:(WKNavigation*)navigation {
  self.record.webViewLoaded = YES;
  self.record.currentURL = webView.URL.absoluteString;
}

@end

namespace {

template <typename Block>
void RunOnMainQueueSync(Block block) {
  if ([NSThread isMainThread]) {
    block();
    return;
  }

  dispatch_sync(dispatch_get_main_queue(), block);
}

struct FrameInput {
  double x;
  double y;
  double width;
  double height;
};

struct DisplayInput {
  FrameInput bounds;
  FrameInput workArea;
};

NSMutableDictionary* GetPanelRecords() {
  static NSMutableDictionary* panelRecords = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    panelRecords = [[NSMutableDictionary alloc] init];
  });

  return panelRecords;
}

NSString* GetPanelKey(NSPanel* panel) {
  return [NSString stringWithFormat:@"%p", panel];
}

OverlayPanelRecord* GetPanelRecord(NSPanel* panel) {
  if (panel == nil) {
    return nil;
  }

  return [GetPanelRecords() objectForKey:GetPanelKey(panel)];
}

void StorePanelRecord(OverlayPanelRecord* record) {
  if (record == nil || record.panel == nil) {
    return;
  }

  [GetPanelRecords() setObject:record forKey:GetPanelKey(record.panel)];
}

void RemovePanelRecord(NSPanel* panel) {
  if (panel == nil) {
    return;
  }

  [GetPanelRecords() removeObjectForKey:GetPanelKey(panel)];
}

bool ReadFrameInput(Napi::Env env, const Napi::Object& input, FrameInput* frame) {
  if (!input.Has("x") || !input.Has("y") || !input.Has("width") || !input.Has("height")) {
    Napi::TypeError::New(env, "Frame input must include x, y, width, and height.").ThrowAsJavaScriptException();
    return false;
  }

  frame->x = input.Get("x").As<Napi::Number>().DoubleValue();
  frame->y = input.Get("y").As<Napi::Number>().DoubleValue();
  frame->width = input.Get("width").As<Napi::Number>().DoubleValue();
  frame->height = input.Get("height").As<Napi::Number>().DoubleValue();
  return true;
}

bool ReadDisplayInput(Napi::Env env, const Napi::Object& input, DisplayInput* display) {
  if (!input.Has("bounds") || !input.Has("workArea")) {
    Napi::TypeError::New(env, "Display input must include bounds and workArea.").ThrowAsJavaScriptException();
    return false;
  }

  return ReadFrameInput(env, input.Get("bounds").As<Napi::Object>(), &display->bounds) &&
         ReadFrameInput(env, input.Get("workArea").As<Napi::Object>(), &display->workArea);
}

NSRect ToAppKitRect(const FrameInput& frame, const DisplayInput& display) {
  const double relativeX = frame.x - display.bounds.x;
  const double relativeTop = frame.y - display.bounds.y;
  const double appKitX = display.bounds.x + relativeX;
  const double appKitY = display.bounds.y + display.bounds.height - relativeTop - frame.height;

  return NSMakeRect(appKitX, appKitY, frame.width, frame.height);
}

FrameInput ToTopLeftFrame(const NSRect& frame, const DisplayInput& display) {
  return FrameInput{
    frame.origin.x,
    display.bounds.y + display.bounds.height - NSMaxY(frame),
    frame.size.width,
    frame.size.height,
  };
}

Napi::Object ToFrameObject(Napi::Env env, const FrameInput& frame) {
  Napi::Object result = Napi::Object::New(env);
  result.Set("x", Napi::Number::New(env, frame.x));
  result.Set("y", Napi::Number::New(env, frame.y));
  result.Set("width", Napi::Number::New(env, frame.width));
  result.Set("height", Napi::Number::New(env, frame.height));
  return result;
}

Napi::Object ToFrameObject(Napi::Env env, const NSRect& frame) {
  return ToFrameObject(env, FrameInput{
    frame.origin.x,
    frame.origin.y,
    frame.size.width,
    frame.size.height,
  });
}

void* GetRawPointerFromHandle(const Napi::Buffer<char>& handleBuffer) {
  if (handleBuffer.Length() < sizeof(void*)) {
    return nullptr;
  }

  return *reinterpret_cast<void* const*>(handleBuffer.Data());
}

Napi::Value MakeHandleBuffer(Napi::Env env, const void* pointer) {
  return Napi::Buffer<char>::Copy(env, reinterpret_cast<const char*>(&pointer), sizeof(pointer));
}

NSPanel* GetPanelFromHandle(const Napi::Buffer<char>& handleBuffer) {
  void* rawPointer = GetRawPointerFromHandle(handleBuffer);
  if (rawPointer == nullptr) {
    return nil;
  }

  id candidate = (__bridge id)rawPointer;
  if (![candidate isKindOfClass:[NSPanel class]]) {
    return nil;
  }

  return (NSPanel*)candidate;
}

NSString* GetBridgeBootstrapScript() {
  return @R"JS(
(function() {
  if (window.__nativeOverlayBridgeInstalled) {
    return;
  }

  window.__nativeOverlayBridgeInstalled = true;

  const listeners = new Map();
  let nextListenerId = 1;
  let nextRequestId = 1;
  const pendingRequests = new Map();

  const postMessage = (message) => {
    window.webkit.messageHandlers.overlayHost.postMessage(JSON.stringify(message));
  };

  let lastCursor = null;

  const request = (channel, payload) => {
    const requestId = `req-${nextRequestId++}`;
    postMessage({ kind: 'request', requestId, channel, payload });
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
    });
  };

  const emit = (channel, payload) => {
    for (const listener of listeners.values()) {
      listener(channel, payload);
    }
  };

  window.__nativeOverlayReceive = (rawMessage) => {
    const message = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

    if (message.kind === 'response') {
      const pending = pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }

      pendingRequests.delete(message.requestId);
      if (message.ok) {
        pending.resolve(message.payload);
      } else {
        pending.reject(new Error(message.error || 'Native bridge request failed'));
      }
      return;
    }

    if (message.kind === 'event') {
      emit(message.channel, message.payload);
    }
  };

  const subscribe = (channel, listener) => {
    const listenerId = nextListenerId++;
    listeners.set(listenerId, (nextChannel, payload) => {
      if (nextChannel === channel) {
        listener(payload);
      }
    });

    return () => {
      listeners.delete(listenerId);
    };
  };

  const getCursorTarget = (event) => {
    if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
      if (pointedElement instanceof Element) {
        return pointedElement;
      }
    }

    if (event?.target instanceof Element) {
      return event.target;
    }

    if (event?.target && event.target.parentElement instanceof Element) {
      return event.target.parentElement;
    }

    return null;
  };

  const resolveCursorStyle = (target) => {
    if (!(target instanceof Element)) {
      return 'default';
    }

    const interactiveTarget = target.closest(
      'button, a[href], label, input:not([type="hidden"]), textarea, select, [role="button"], [data-cursor="pointer"]'
    );

    if (interactiveTarget instanceof Element) {
      if (
        interactiveTarget instanceof HTMLInputElement
        || interactiveTarget instanceof HTMLTextAreaElement
      ) {
        const inputType = interactiveTarget instanceof HTMLInputElement ? interactiveTarget.type : 'textarea';
        if (
          inputType === 'text'
          || inputType === 'search'
          || inputType === 'email'
          || inputType === 'url'
          || inputType === 'password'
          || inputType === 'number'
          || inputType === 'tel'
          || inputType === 'textarea'
        ) {
          return 'text';
        }
      }

      const interactiveCursor = window.getComputedStyle(interactiveTarget).cursor;
      if ('disabled' in interactiveTarget && interactiveTarget.disabled) {
        return interactiveCursor && interactiveCursor !== 'auto' ? interactiveCursor : 'default';
      }

      return interactiveCursor && interactiveCursor !== 'auto' ? interactiveCursor : 'pointer';
    }

    const computedCursor = window.getComputedStyle(target).cursor;
    return computedCursor && computedCursor !== 'auto' ? computedCursor : 'default';
  };

  const syncNativeCursor = (eventOrTarget) => {
    const target = eventOrTarget instanceof Element ? eventOrTarget : getCursorTarget(eventOrTarget);
    const nextCursor = resolveCursorStyle(target);

    if (nextCursor === lastCursor) {
      return;
    }

    lastCursor = nextCursor;
    postMessage({
      kind: 'event',
      channel: 'native:set-cursor',
      payload: {
        cursor: nextCursor,
      },
    });
  };

  document.addEventListener('mousemove', (event) => {
    syncNativeCursor(event);
  }, { capture: true, passive: true });

  document.addEventListener('mouseover', (event) => {
    syncNativeCursor(event);
  }, { capture: true, passive: true });

  document.addEventListener('mouseout', (event) => {
    syncNativeCursor(event);
  }, { capture: true, passive: true });

  window.addEventListener('blur', () => {
    syncNativeCursor(null);
  });

  window.api = {
    overlay: {
      getState: () => request('overlay:get-state'),
      subscribe: (listener) => subscribe('overlay:updated', listener),
    },
    agent: {
      getSetup: () => request('agent:get-setup'),
      resolveApproval: (sessionId, decision) => request('agent:resolve-approval', { sessionId, decision }),
      answerQuestion: (sessionId, response) => request('agent:answer-question', { sessionId, response }),
      handoffApproval: (sessionId) => request('agent:handoff-approval', sessionId),
    },
    config: {
      reload: () => request('config:reload'),
    },
    app: {
      getStatus: () => request('app:get-status'),
      openTarget: (targetUrl) => request('app:open-target', targetUrl),
      jumpToAgentSession: (sessionId) => request('app:jump-to-agent-session', sessionId),
      setOverlayExpanded: (expanded) => request('app:set-overlay-expanded', expanded),
      setExpandedContentHeight: (height) => request('app:set-expanded-content-height', height),
      setReminderHoldActive: (active) => request('app:set-reminder-hold-active', active),
      subscribeOverlayMode: (listener) => subscribe('app:overlay-mode-changed', listener),
    },
  };

  postMessage({ kind: 'event', channel: 'bridge-ready', payload: null });
})();
)JS";
}

WKWebView* CreateWebView(OverlayPanelRecord* record, NSRect frame) {
  WKUserContentController* contentController = [[[WKUserContentController alloc] init] autorelease];
  WKUserScript* bootstrapScript = [[[WKUserScript alloc] initWithSource:GetBridgeBootstrapScript()
                                                          injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                       forMainFrameOnly:YES] autorelease];
  [contentController addUserScript:bootstrapScript];

  OverlayBridgeScriptHandler* handler = [[[OverlayBridgeScriptHandler alloc] init] autorelease];
  handler.record = record;
  [contentController addScriptMessageHandler:handler name:@"overlayHost"];

  WKWebViewConfiguration* configuration = [[[WKWebViewConfiguration alloc] init] autorelease];
  configuration.userContentController = contentController;
  configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
  configuration.defaultWebpagePreferences.allowsContentJavaScript = YES;

  OverlayWebView* webView = [[[OverlayWebView alloc] initWithFrame:frame configuration:configuration] autorelease];
  webView.record = record;
  webView.navigationDelegate = handler;
  [webView setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
  [webView setHidden:NO];
  [webView setValue:@NO forKey:@"drawsBackground"];
  if (@available(macOS 13.0, *)) {
    webView.underPageBackgroundColor = [NSColor clearColor];
  }
  return webView;
}

Napi::Object BuildPanelDiagnostics(Napi::Env env, NSPanel* panel, const DisplayInput* display) {
  Napi::Object result = Napi::Object::New(env);
  __block NSRect frame = NSZeroRect;
  __block BOOL isVisible = NO;
  __block NSUInteger occlusionState = 0;
  __block NSInteger level = 0;
  __block NSUInteger collectionBehavior = 0;
  __block NSScreen* screen = nil;
  __block BOOL webViewLoaded = NO;
  __block BOOL bridgeReady = NO;
  __block NSRect contentViewFrame = NSZeroRect;
  __block NSString* currentURL = nil;

  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    frame = [panel frame];
    isVisible = [panel isVisible];
    occlusionState = [panel occlusionState];
    level = [panel level];
    collectionBehavior = [panel collectionBehavior];
    screen = [panel screen];
    webViewLoaded = record != nil ? record.webViewLoaded : NO;
    bridgeReady = record != nil ? record.bridgeReady : NO;
    contentViewFrame = record != nil && record.webView != nil ? [record.webView frame] : NSZeroRect;
    currentURL = record != nil ? record.currentURL : nil;
  });

  if (display != nullptr) {
    result.Set("frame", ToFrameObject(env, ToTopLeftFrame(frame, *display)));
    result.Set("contentViewFrame", ToFrameObject(env, ToTopLeftFrame(contentViewFrame, *display)));
  } else {
    result.Set("frame", env.Null());
    result.Set("contentViewFrame", env.Null());
  }

  result.Set("visible", Napi::Boolean::New(env, isVisible));
  result.Set("occluded", Napi::Boolean::New(env, (occlusionState & NSWindowOcclusionStateVisible) == 0));
  result.Set("level", Napi::Number::New(env, level));
  result.Set("collectionBehavior", Napi::Number::New(env, collectionBehavior));
  result.Set("webViewLoaded", Napi::Boolean::New(env, webViewLoaded));
  result.Set("bridgeReady", Napi::Boolean::New(env, bridgeReady));
  result.Set("currentUrl", currentURL != nil ? Napi::String::New(env, [currentURL UTF8String]) : env.Null());

  if (screen != nil) {
    result.Set("screenFrame", ToFrameObject(env, [screen frame]));
    result.Set("screenVisibleFrame", ToFrameObject(env, [screen visibleFrame]));
  } else {
    result.Set("screenFrame", env.Null());
    result.Set("screenVisibleFrame", env.Null());
  }

  return result;
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value GetUnavailableReason(const Napi::CallbackInfo& info) {
  return info.Env().Null();
}

Napi::Value GetLoadDiagnostics(const Napi::CallbackInfo& info) {
  return info.Env().Null();
}

Napi::Value CreatePanel(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  __block NSPanel* panel = nil;

  RunOnMainQueueSync(^{
    const NSRect initialFrame = NSMakeRect(0, 0, 400, 32);
    const NSUInteger styleMask = NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel;
    panel = [[[OverlayPanel alloc] initWithContentRect:initialFrame
                                             styleMask:styleMask
                                               backing:NSBackingStoreBuffered
                                                 defer:NO] autorelease];

    if (panel == nil) {
      return;
    }

    OverlayTrackingView* containerView = [[[OverlayTrackingView alloc] initWithFrame:initialFrame] autorelease];
    [containerView setAutoresizesSubviews:YES];
    [containerView setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
    [containerView setWantsLayer:YES];
    [[containerView layer] setBackgroundColor:[[NSColor clearColor] CGColor]];
    [containerView syncVisibleShapeMask];

    OverlayPanelRecord* record = [[[OverlayPanelRecord alloc] init] autorelease];
    record.panel = panel;
    record.containerView = containerView;
    ((OverlayTrackingView*)containerView).record = record;
    record.callback = new PanelBridgeCallback();
    record.webViewLoaded = NO;
    record.bridgeReady = NO;
    record.pointerInside = NO;
    record.currentURL = nil;
    record.currentCursorStyle = @"default";
    record.webView = CreateWebView(record, initialFrame);
    [containerView addSubview:record.webView];

    [panel setContentView:containerView];
    [panel setFloatingPanel:YES];
    [panel setBecomesKeyOnlyIfNeeded:NO];
    [panel setLevel:NSScreenSaverWindowLevel];
    [panel setOpaque:NO];
    [panel setHasShadow:NO];
    [panel setBackgroundColor:[NSColor clearColor]];
    [panel setAlphaValue:1.0];
    [[panel contentView] setWantsLayer:YES];
    [[[panel contentView] layer] setBackgroundColor:[[NSColor clearColor] CGColor]];
    [panel setCollectionBehavior:(NSWindowCollectionBehaviorCanJoinAllSpaces |
                                  NSWindowCollectionBehaviorFullScreenAuxiliary |
                                  NSWindowCollectionBehaviorStationary |
                                  NSWindowCollectionBehaviorIgnoresCycle)];
    [panel setAcceptsMouseMovedEvents:YES];
    [panel setHidesOnDeactivate:NO];
    [panel setMovable:NO];
    [panel setMovableByWindowBackground:NO];
    [panel setExcludedFromWindowsMenu:YES];
    [panel setReleasedWhenClosed:NO];
    [panel setWorksWhenModal:YES];

    StorePanelRecord(record);

    const NSEventMask monitorMask =
      NSEventMaskMouseMoved |
      NSEventMaskLeftMouseDown |
      NSEventMaskLeftMouseUp |
      NSEventMaskRightMouseDown |
      NSEventMaskRightMouseUp |
      NSEventMaskOtherMouseDown |
      NSEventMaskOtherMouseUp |
      NSEventMaskScrollWheel;
    __unsafe_unretained OverlayTrackingView* trackingView = containerView;
    record.localMouseMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:monitorMask handler:^NSEvent*(NSEvent* event) {
      [trackingView syncPointerState];
      ScheduleCursorRefreshForRecord(trackingView.record);
      return event;
    }];
    record.globalMouseMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:monitorMask handler:^(NSEvent* event) {
      RunOnMainQueueSync(^{
        [trackingView syncPointerState];
        ScheduleCursorRefreshForRecord(trackingView.record);
      });
    }];
    [containerView syncPointerState];
  });

  if (panel == nil) {
    return env.Null();
  }

  return MakeHandleBuffer(env, (__bridge const void*)panel);
}

Napi::Value DestroyPanel(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "destroyPanel requires a panel handle buffer.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  __block bool didDestroy = false;
  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record != nil && record.callback != nullptr) {
      record.callback->Clear();
      delete record.callback;
      record.callback = nullptr;
    }

    [panel orderOut:nil];
    [panel close];
    RemovePanelRecord(panel);
    didDestroy = true;
  });

  return Napi::Boolean::New(env, didDestroy);
}

Napi::Value LoadPanelUrl(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsString()) {
    Napi::TypeError::New(env, "loadPanelUrl requires a panel handle buffer and URL string.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  std::string urlString = info[1].As<Napi::String>().Utf8Value();
  __block bool didLoad = false;
  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record == nil || record.webView == nil) {
      return;
    }

    NSString* nsUrlString = [NSString stringWithUTF8String:urlString.c_str()];
    NSURL* url = [NSURL URLWithString:nsUrlString];
    if (url == nil) {
      return;
    }

    record.webViewLoaded = NO;
    record.bridgeReady = NO;
    record.pointerInside = NO;
    record.currentURL = [url absoluteString];
    [record.webView loadRequest:[NSURLRequest requestWithURL:url]];
    [((OverlayTrackingView*)record.containerView) syncPointerState];
    didLoad = true;
  });

  return Napi::Boolean::New(env, didLoad);
}

Napi::Value LoadPanelFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsString()) {
    Napi::TypeError::New(env, "loadPanelFile requires a panel handle buffer and file path string.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  std::string filePath = info[1].As<Napi::String>().Utf8Value();
  __block bool didLoad = false;
  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record == nil || record.webView == nil) {
      return;
    }

    NSString* resolvedPath = [NSString stringWithUTF8String:filePath.c_str()];
    NSURL* fileUrl = [NSURL fileURLWithPath:resolvedPath];
    NSURL* readAccessUrl = [fileUrl URLByDeletingLastPathComponent];
    record.webViewLoaded = NO;
    record.bridgeReady = NO;
    record.pointerInside = NO;
    record.currentURL = [fileUrl absoluteString];
    didLoad = [record.webView loadFileURL:fileUrl allowingReadAccessToURL:readAccessUrl];
    [((OverlayTrackingView*)record.containerView) syncPointerState];
  });

  return Napi::Boolean::New(env, didLoad);
}

Napi::Value SetPanelMessageCallback(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "setPanelMessageCallback requires a panel handle buffer and callback.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  __block bool didSet = false;
  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record == nil || record.callback == nullptr) {
      return;
    }

    didSet = record.callback->Set(env, info[1].As<Napi::Function>());
  });

  return Napi::Boolean::New(env, didSet);
}

Napi::Value DispatchPanelMessage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsString()) {
    Napi::TypeError::New(env, "dispatchPanelMessage requires a panel handle buffer and message string.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  std::string message = info[1].As<Napi::String>().Utf8Value();
  __block bool didDispatch = false;
  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record == nil || record.webView == nil) {
      return;
    }

    NSError* error = nil;
    NSData* messageData = [NSData dataWithBytes:message.data() length:message.size()];
    NSString* messageLiteral = [[NSString alloc] initWithData:messageData encoding:NSUTF8StringEncoding];
    NSData* serialized = [NSJSONSerialization dataWithJSONObject:@[[messageLiteral autorelease]] options:0 error:&error];
    if (serialized == nil || error != nil) {
      return;
    }

    NSString* serializedString = [[[NSString alloc] initWithData:serialized encoding:NSUTF8StringEncoding] autorelease];
    NSString* script = [NSString stringWithFormat:@"window.__nativeOverlayReceive(%@[0]);", serializedString];
    [record.webView evaluateJavaScript:script completionHandler:nil];
    didDispatch = true;
  });

  return Napi::Boolean::New(env, didDispatch);
}

Napi::Value SetPanelFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsBuffer() || !info[1].IsObject() || !info[2].IsObject()) {
    Napi::TypeError::New(env, "setPanelFrame requires a panel handle buffer, frame object, and display object.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  FrameInput input{};
  if (!ReadFrameInput(env, info[1].As<Napi::Object>(), &input)) {
    return Napi::Boolean::New(env, false);
  }

  DisplayInput display{};
  if (!ReadDisplayInput(env, info[2].As<Napi::Object>(), &display)) {
    return Napi::Boolean::New(env, false);
  }

  __block bool didSetFrame = false;
  RunOnMainQueueSync(^{
    const NSRect nextFrame = ToAppKitRect(input, display);
    [panel setFrame:nextFrame display:YES animate:NO];
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record != nil && record.containerView != nil) {
      [((OverlayTrackingView*)record.containerView) syncPointerState];
    }
    didSetFrame = NSEqualRects([panel frame], nextFrame);
  });

  return Napi::Boolean::New(env, didSetFrame);
}

Napi::Value GetPanelFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "getPanelFrame requires a panel handle buffer and display object.").ThrowAsJavaScriptException();
    return env.Null();
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return env.Null();
  }

  DisplayInput display{};
  if (!ReadDisplayInput(env, info[1].As<Napi::Object>(), &display)) {
    return env.Null();
  }

  __block NSRect frame = NSZeroRect;
  RunOnMainQueueSync(^{
    frame = [panel frame];
  });

  const FrameInput topLeftFrame = ToTopLeftFrame(frame, display);
  return ToFrameObject(env, topLeftFrame);
}

Napi::Value GetPanelDiagnostics(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "getPanelDiagnostics requires a panel handle buffer.").ThrowAsJavaScriptException();
    return env.Null();
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return env.Null();
  }

  DisplayInput display{};
  DisplayInput* displayPtr = nullptr;
  if (info.Length() >= 2 && info[1].IsObject()) {
    if (!ReadDisplayInput(env, info[1].As<Napi::Object>(), &display)) {
      return env.Null();
    }

    displayPtr = &display;
  }

  return BuildPanelDiagnostics(env, panel, displayPtr);
}

Napi::Value SyncPanelPointerState(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "syncPanelPointerState requires a panel handle buffer.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  __block bool didSync = false;
  RunOnMainQueueSync(^{
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record == nil || record.containerView == nil) {
      return;
    }

    [((OverlayTrackingView*)record.containerView) syncPointerState];
    ScheduleCursorRefreshForRecord(record);
    didSync = true;
  });

  return Napi::Boolean::New(env, didSync);
}

Napi::Value OrderPanelFrontRegardless(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "orderPanelFrontRegardless requires a panel handle buffer.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  __block bool didOrderFront = false;
  RunOnMainQueueSync(^{
    [panel orderFrontRegardless];
    OverlayPanelRecord* record = GetPanelRecord(panel);
    if (record != nil && record.containerView != nil) {
      [((OverlayTrackingView*)record.containerView) syncPointerState];
    }
    didOrderFront = [panel isVisible];
  });

  return Napi::Boolean::New(env, didOrderFront);
}

Napi::Value OrderPanelOut(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "orderPanelOut requires a panel handle buffer.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSPanel* panel = GetPanelFromHandle(info[0].As<Napi::Buffer<char>>());
  if (panel == nil) {
    return Napi::Boolean::New(env, false);
  }

  __block bool didOrderOut = false;
  RunOnMainQueueSync(^{
    [panel orderOut:nil];
    didOrderOut = ![panel isVisible];
  });

  return Napi::Boolean::New(env, didOrderOut);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("getUnavailableReason", Napi::Function::New(env, GetUnavailableReason));
  exports.Set("getLoadDiagnostics", Napi::Function::New(env, GetLoadDiagnostics));
  exports.Set("createPanel", Napi::Function::New(env, CreatePanel));
  exports.Set("destroyPanel", Napi::Function::New(env, DestroyPanel));
  exports.Set("loadPanelUrl", Napi::Function::New(env, LoadPanelUrl));
  exports.Set("loadPanelFile", Napi::Function::New(env, LoadPanelFile));
  exports.Set("setPanelMessageCallback", Napi::Function::New(env, SetPanelMessageCallback));
  exports.Set("dispatchPanelMessage", Napi::Function::New(env, DispatchPanelMessage));
  exports.Set("setPanelFrame", Napi::Function::New(env, SetPanelFrame));
  exports.Set("getPanelFrame", Napi::Function::New(env, GetPanelFrame));
  exports.Set("getPanelDiagnostics", Napi::Function::New(env, GetPanelDiagnostics));
  exports.Set("syncPanelPointerState", Napi::Function::New(env, SyncPanelPointerState));
  exports.Set("orderPanelFrontRegardless", Napi::Function::New(env, OrderPanelFrontRegardless));
  exports.Set("orderPanelOut", Napi::Function::New(env, OrderPanelOut));
  return exports;
}

}  // namespace

NODE_API_MODULE(macos_overlay_panel, Init)
