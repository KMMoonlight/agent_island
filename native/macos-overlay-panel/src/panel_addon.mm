#include <napi.h>

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

namespace {

struct FrameInput {
  double x;
  double y;
  double width;
  double height;
};

NSWindow* GetWindowFromHandle(const Napi::Buffer<char>& handleBuffer) {
  if (handleBuffer.Length() < sizeof(void*)) {
    return nil;
  }

  void* rawPointer = *reinterpret_cast<void* const*>(handleBuffer.Data());
  if (rawPointer == nullptr) {
    return nil;
  }

  return (__bridge NSWindow*)rawPointer;
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

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value GetUnavailableReason(const Napi::CallbackInfo& info) {
  return info.Env().Null();
}

Napi::Value ConfigureWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "configureWindow requires a native handle buffer.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSWindow* window = GetWindowFromHandle(info[0].As<Napi::Buffer<char>>());
  if (window == nil) {
    return Napi::Boolean::New(env, false);
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    [window setLevel:NSStatusWindowLevel];
    [window setOpaque:NO];
    [window setHasShadow:NO];
    [window setBackgroundColor:[NSColor clearColor]];
    [window setCollectionBehavior:(NSWindowCollectionBehaviorCanJoinAllSpaces |
                                   NSWindowCollectionBehaviorFullScreenAuxiliary |
                                   NSWindowCollectionBehaviorStationary |
                                   NSWindowCollectionBehaviorIgnoresCycle)];
    [window setHidesOnDeactivate:NO];
    [window setMovable:NO];
    [window setMovableByWindowBackground:NO];
    [window setExcludedFromWindowsMenu:YES];
  });

  return Napi::Boolean::New(env, true);
}

Napi::Value SetFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "setFrame requires a native handle buffer and frame object.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSWindow* window = GetWindowFromHandle(info[0].As<Napi::Buffer<char>>());
  if (window == nil) {
    return Napi::Boolean::New(env, false);
  }

  FrameInput input{};
  if (!ReadFrameInput(env, info[1].As<Napi::Object>(), &input)) {
    return Napi::Boolean::New(env, false);
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    NSScreen* screen = window.screen ?: [NSScreen mainScreen];
    if (screen == nil) {
      return;
    }

    const NSRect screenFrame = [screen frame];
    const NSRect nextFrame = NSMakeRect(
      input.x,
      screenFrame.origin.y + screenFrame.size.height - input.y - input.height,
      input.width,
      input.height
    );

    [window setFrame:nextFrame display:YES animate:NO];
  });

  return Napi::Boolean::New(env, true);
}

Napi::Value GetFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "getFrame requires a native handle buffer.").ThrowAsJavaScriptException();
    return env.Null();
  }

  NSWindow* window = GetWindowFromHandle(info[0].As<Napi::Buffer<char>>());
  if (window == nil) {
    return env.Null();
  }

  __block NSRect frame = NSZeroRect;
  dispatch_sync(dispatch_get_main_queue(), ^{
    frame = [window frame];
  });

  NSScreen* screen = window.screen ?: [NSScreen mainScreen];
  if (screen == nil) {
    return env.Null();
  }

  const NSRect screenFrame = [screen frame];
  Napi::Object result = Napi::Object::New(env);
  result.Set("x", Napi::Number::New(env, frame.origin.x));
  result.Set("y", Napi::Number::New(env, screenFrame.origin.y + screenFrame.size.height - NSMaxY(frame)));
  result.Set("width", Napi::Number::New(env, frame.size.width));
  result.Set("height", Napi::Number::New(env, frame.size.height));
  return result;
}

Napi::Value OrderFrontRegardless(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "orderFrontRegardless requires a native handle buffer.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  NSWindow* window = GetWindowFromHandle(info[0].As<Napi::Buffer<char>>());
  if (window == nil) {
    return Napi::Boolean::New(env, false);
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    [window orderFrontRegardless];
  });

  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("getUnavailableReason", Napi::Function::New(env, GetUnavailableReason));
  exports.Set("configureWindow", Napi::Function::New(env, ConfigureWindow));
  exports.Set("setFrame", Napi::Function::New(env, SetFrame));
  exports.Set("getFrame", Napi::Function::New(env, GetFrame));
  exports.Set("orderFrontRegardless", Napi::Function::New(env, OrderFrontRegardless));
  return exports;
}

}  // namespace

NODE_API_MODULE(macos_overlay_panel, Init)
