{
  "targets": [
    {
      "target_name": "macos_overlay_panel",
      "sources": ["src/panel_addon.mm"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "12.0"
      },
      "libraries": ["-framework AppKit", "-framework CoreGraphics"]
    }
  ]
}
