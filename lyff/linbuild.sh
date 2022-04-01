#!/bin/sh
fpc webserver.lpr
ppcrosswasm32 -Twasi -olyff.wasm lyff.pas
cp -p lyff.wasm htdocs
