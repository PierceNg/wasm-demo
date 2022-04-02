# Conway Life Demo

This is a reworked demonstration of WebAssembly with Free Pascal by Pierce
Ng (@PierceNg), based on the original by Dmitry Boyarintsev (@skalogryz).

## Running

### Linux

Tested on Ubuntu 20.04. The WebAssembly binary ```lyff.wasm``` is already
included in this repo. Just use a local web server to publish the content
of ```htdocs``` say by using a Python 1-liner. You could also just compile
```webserver.lpr``` in this directory and run it.

To hack WebAssembly with Pascal, you need FPC for WebAssembly. To set up FPC for
WebAssembly, see [top-level README](/README.md).

Build it:

```
% ./linbuild.sh
Free Pascal Compiler version 3.2.2 [2022/01/13] for x86_64
Copyright (c) 1993-2021 by Florian Klaempfl and others
Target OS: Linux for x86-64
Compiling webserver.lpr
Linking webserver
22 lines compiled, 0.3 sec
Free Pascal Compiler version 3.3.1 [2022/03/27] for wasm32
Copyright (c) 1993-2022 by Florian Klaempfl and others
Target OS: The WebAssembly System Interface (WASI)
Compiling lyff.pas
Linking lyff.wasm
176 lines compiled, 0.1 sec
```

Run it:

```
% ./linrun.sh
Visit localhost:8000 with your web server.
```

### macOS

Tested on macOS Catalina. The WebAssembly binary ```lyff.wasm``` is already
included in this repo. Just use a local web server to publish the content
of ```htdocs``` say by using a Python 1-liner. You could also just compile
```webserver.lpr``` in this directory and run it.

To hack WebAssembly with Pascal, you need FPC for WebAssembly. To set up FPC for
WebAssembly, see [top-level README](/README.md).

Build it:

```
% ./macbuild.sh
Free Pascal Compiler version 3.2.2 [2022/02/21] for x86_64
Copyright (c) 1993-2021 by Florian Klaempfl and others
Target OS: Darwin for x86_64
Compiling webserver.lpr
Assembling webserver
Linking webserver
22 lines compiled, 1.3 sec
Free Pascal Compiler version 3.3.1 [2022/03/31] for wasm32
Copyright (c) 1993-2022 by Florian Klaempfl and others
Target OS: The WebAssembly System Interface (WASI)
Compiling lyff.pas
Linking lyff.wasm
176 lines compiled, 0.1 sec
```

Run it:

```
% ./macrun.sh
Visit localhost:8000 with your web server.
```

### Windows

Tested on Windows 10 21H2. The WebAssembly binary ```lyff.wasm``` is already
included in this repo. Just use a local web server to publish the content
of ```htdocs``` say by using a Python 1-liner. You could also just compile
```webserver.lpr``` in this directory and run it.

To hack WebAssembly with Pascal, you need FPC for WebAssembly. To set up FPC for
WebAssembly, see [top-level README](/README.md).

Build it:

```
C:\Users\OnlyMe\wasm-demo> winbuild
Make sure fpc.exe and ppcrosswasm32.exe are on your PATH.
Building...
Free Pascal Compiler version 3.2.2 [2022/01/02] for x86_64
Copyright (c) 1993-2021 by Florian Klaempfl and others
Target OS: Win64 for x64
Compiling webserver.lpr
Linking webserver.exe
22 lines compiled, 0.5 sec, 283872 bytes code, 13668 bytes data
Free Pascal Compiler version 3.3.1 [2022/04/01] for wasm32
Copyright (c) 1993-2022 by Florian Klaempfl and others
Target OS: The WebAssembly System Interface (WASI)
Compiling lyff.pas
Linking lyff.wasm
176 lines compiled, 0.2 sec
        1 file(s) copied.
```

Run it:

```
C:\Users\OnlyMe\wasm-demo> winrun
Visit localhost:8000 with your web server.
```

