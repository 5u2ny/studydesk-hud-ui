#import <Cocoa/Cocoa.h>
#import <napi.h>

Napi::Value MakePanel(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        return Napi::Boolean::New(env, false);
    }

    Napi::Buffer<void*> buffer = info[0].As<Napi::Buffer<void*>>();
    void* handle = *reinterpret_cast<void**>(buffer.Data());
    
    if (!handle) {
        return Napi::Boolean::New(env, false);
    }

    NSView* view = (__bridge NSView*)handle;
    NSWindow* window = [view window];

    if (window) {
        [window setStyleMask:[window styleMask] | NSWindowStyleMaskNonactivatingPanel];
        [window setCollectionBehavior: NSWindowCollectionBehaviorCanJoinAllSpaces | 
                                       NSWindowCollectionBehaviorStationary | 
                                       NSWindowCollectionBehaviorFullScreenAuxiliary | 
                                       NSWindowCollectionBehaviorIgnoresCycle];
        
        return Napi::Boolean::New(env, true);
    }

    return Napi::Boolean::New(env, false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "makePanel"), Napi::Function::New(env, MakePanel));
    return exports;
}

NODE_API_MODULE(notch_helper, Init)
