#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <napi.h>

// ── Private CGS APIs ──────────────────────────────────────────────────────
typedef int           CGSConnectionID;
typedef uint64_t      CGSSpaceID;

extern "C" {
    CGSConnectionID _CGSDefaultConnection(void);
    CGSSpaceID      CGSSpaceCreate(CGSConnectionID cid, int unknown, void* options);
    void            CGSSpaceSetAbsoluteLevel(CGSConnectionID cid, CGSSpaceID space, int level);
    void            CGSAddWindowsToSpaces(CGSConnectionID cid, CFArrayRef windows, CFArrayRef spaces);
    void            CGSShowSpaces(CGSConnectionID cid, CFArrayRef spaces);
}

// One space for the lifetime of the process — matches boring.notch pattern.
static CGSSpaceID sNotchSpaceID = 0;

// Per-instance flag attached via associated object.
static const void* kBypassConstrainKey = &kBypassConstrainKey;

// Holds the original implementation of constrainFrameRect:toScreen: on
// whichever NSWindow class implemented it. We swizzle once and call it
// for every other window so unrelated Electron windows are unaffected.
typedef NSRect (*ConstrainIMP)(id, SEL, NSRect, NSScreen*);
static ConstrainIMP gOriginalConstrainIMP = NULL;
static SEL          gConstrainSEL         = NULL;
static BOOL         gSwizzleInstalled     = NO;

static NSRect SwizzledConstrainFrameRect(id self, SEL _cmd, NSRect frame, NSScreen* screen) {
    NSNumber* bypass = objc_getAssociatedObject(self, kBypassConstrainKey);
    if (bypass != nil && [bypass boolValue]) {
        return frame; // identity — never clamp this window
    }
    if (gOriginalConstrainIMP) {
        return gOriginalConstrainIMP(self, _cmd, frame, screen);
    }
    return frame;
}

static void InstallSwizzleIfNeeded(void) {
    if (gSwizzleInstalled) return;
    gConstrainSEL = @selector(constrainFrameRect:toScreen:);

    // The implementation lives on NSWindow; even NSPanel inherits it
    // unless explicitly overridden, so swizzling NSWindow covers both.
    Class cls = [NSWindow class];
    Method m  = class_getInstanceMethod(cls, gConstrainSEL);
    if (!m) return;

    IMP newIMP = (IMP)SwizzledConstrainFrameRect;
    gOriginalConstrainIMP = (ConstrainIMP)method_setImplementation(m, newIMP);
    gSwizzleInstalled = YES;
}

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

    NSView*   view   = (__bridge NSView*)handle;
    NSWindow* window = [view window];

    if (!window) {
        return Napi::Boolean::New(env, false);
    }

    // ── 1. Swizzle constrainFrameRect:toScreen: once, mark THIS window ───
    // Without this, AppKit clamps the y to visibleFrame.maxY (i.e. just
    // below the menu bar) every time setFrameOrigin: is called. With the
    // associated-object flag, only our notch window bypasses the clamp;
    // every other Electron window is unaffected.
    InstallSwizzleIfNeeded();
    objc_setAssociatedObject(window, kBypassConstrainKey, @(YES),
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    // ── 2. Collection behaviour ──────────────────────────────────────────
    [window setStyleMask:[window styleMask] | NSWindowStyleMaskNonactivatingPanel];
    [window setCollectionBehavior:
        NSWindowCollectionBehaviorCanJoinAllSpaces   |
        NSWindowCollectionBehaviorStationary         |
        NSWindowCollectionBehaviorFullScreenAuxiliary|
        NSWindowCollectionBehaviorIgnoresCycle];

    // ── 3. Window level — INT_MAX puts it above menu bar & dock ─────────
    [window setLevel:NSWindowLevel(2147483647)];

    // ── 4. CGSSpace at absolute level INT_MAX ───────────────────────────
    CGSConnectionID cid = _CGSDefaultConnection();
    if (sNotchSpaceID == 0) {
        sNotchSpaceID = CGSSpaceCreate(cid, 1, nullptr);
        CGSSpaceSetAbsoluteLevel(cid, sNotchSpaceID, 2147483647);
        NSArray* spaces0 = @[@(sNotchSpaceID)];
        CGSShowSpaces(cid, (__bridge CFArrayRef)spaces0);
    }
    NSArray* winNums = @[@([window windowNumber])];
    NSArray* spaces  = @[@(sNotchSpaceID)];
    CGSAddWindowsToSpaces(cid, (__bridge CFArrayRef)winNums, (__bridge CFArrayRef)spaces);

    // ── 5. Reposition flush with the physical top of the display ────────
    // The pill's top sits BEHIND the hardware notch (intentionally — the
    // CSS shape is wider/taller than the notch so the spillover sides
    // and bottom act as a visible extension of the notch, like
    // boring.notch and the Dynamic Island.
    NSScreen* screen = [window screen] ?: [NSScreen mainScreen];
    if (screen) {
        NSRect sf = [screen frame];
        NSRect wf = [window frame];
        NSPoint origin = NSMakePoint(
            sf.origin.x + (sf.size.width - wf.size.width) / 2.0,
            sf.origin.y + sf.size.height - wf.size.height
        );
        [window setFrameOrigin:origin];
    }

    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "makePanel"), Napi::Function::New(env, MakePanel));
    return exports;
}

NODE_API_MODULE(notch_helper, Init)
