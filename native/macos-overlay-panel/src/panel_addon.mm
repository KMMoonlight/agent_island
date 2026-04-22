#include <napi.h>

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
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
@property(nonatomic, assign) BOOL webViewLoaded;
@property(nonatomic, assign) BOOL bridgeReady;
@property(nonatomic, assign) BOOL pointerInside;
@property(nonatomic, copy) NSString* currentURL;
@property(nonatomic, assign) PanelBridgeCallback* callback;
@end

@implementation OverlayPanelRecord
@end

@interface OverlayTrackingView : NSView
@property(nonatomic, assign) OverlayPanelRecord* record;
@end

@implementation OverlayTrackingView {
  NSTrackingArea* _trackingArea;
}

- (void)dealloc {
  if (_trackingArea != nil) {
    [self removeTrackingArea:_trackingArea];
    [_trackingArea release];
    _trackingArea = nil;
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

- (void)mouseEntered:(NSEvent*)event {
  if (self.record == nil || self.record.callback == nullptr || self.record.pointerInside) {
    return;
  }

  self.record.pointerInside = YES;
  self.record.callback->Emit(@"{\"kind\":\"event\",\"channel\":\"native:hover\",\"payload\":{\"inside\":true}}");
}

- (void)mouseExited:(NSEvent*)event {
  if (self.record == nil || self.record.callback == nullptr || !self.record.pointerInside) {
    return;
  }

  self.record.pointerInside = NO;
  self.record.callback->Emit(@"{\"kind\":\"event\",\"channel\":\"native:hover\",\"payload\":{\"inside\":false}}");
}
@end

@interface OverlayBridgeScriptHandler : NSObject <WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, assign) OverlayPanelRecord* record;
@end

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

  window.api = {
    overlay: {
      getState: () => request('overlay:get-state'),
      subscribe: (listener) => subscribe('overlay:updated', listener),
    },
    config: {
      reload: () => request('config:reload'),
    },
    app: {
      getStatus: () => request('app:get-status'),
      openTarget: (targetUrl) => request('app:open-target', targetUrl),
      setOverlayExpanded: (expanded) => request('app:set-overlay-expanded', expanded),
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

  WKWebView* webView = [[[WKWebView alloc] initWithFrame:frame configuration:configuration] autorelease];
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
    panel = [[[NSPanel alloc] initWithContentRect:initialFrame
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

    OverlayPanelRecord* record = [[[OverlayPanelRecord alloc] init] autorelease];
    record.panel = panel;
    record.containerView = containerView;
    ((OverlayTrackingView*)containerView).record = record;
    record.callback = new PanelBridgeCallback();
    record.webViewLoaded = NO;
    record.bridgeReady = NO;
    record.pointerInside = NO;
    record.currentURL = nil;
    record.webView = CreateWebView(record, initialFrame);
    [containerView addSubview:record.webView];

    [panel setContentView:containerView];
    [panel setFloatingPanel:YES];
    [panel setBecomesKeyOnlyIfNeeded:YES];
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
    [panel setHidesOnDeactivate:NO];
    [panel setMovable:NO];
    [panel setMovableByWindowBackground:NO];
    [panel setExcludedFromWindowsMenu:YES];
    [panel setReleasedWhenClosed:NO];
    [panel setWorksWhenModal:YES];

    StorePanelRecord(record);
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
  exports.Set("orderPanelFrontRegardless", Napi::Function::New(env, OrderPanelFrontRegardless));
  exports.Set("orderPanelOut", Napi::Function::New(env, OrderPanelOut));
  return exports;
}

}  // namespace

NODE_API_MODULE(macos_overlay_panel, Init)
