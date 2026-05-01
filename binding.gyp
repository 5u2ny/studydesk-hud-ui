{
  "targets": [
    {
      "target_name": "notch_helper",
      "sources": [ "src/main/native/notch_helper.mm" ],
      "include_dirs": [
        "node_modules/node-addon-api"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CFLAGS": [
          "-ObjC++"
        ]
      },
      "link_settings": {
        "libraries": [
          "-framework Cocoa"
        ]
      }
    }
  ]
}
