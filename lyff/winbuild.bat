@echo off

echo Make sure fpc.exe and ppcrosswasm32.exe are on your PATH.
set fpcexe=fpc.exe
set fpcwasmexe=ppcrosswasm32.exe

echo Building...
"%fpcexe%" webserver.lpr
"%fpcwasmexe%" -l -vi -Twasi -olyff.wasm lyff.pas

copy lyff.wasm htdocs
