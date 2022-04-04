# Conway Life Demo v2

This is a reworked demonstration of WebAssembly with Free Pascal by Pierce Ng (@PierceNg), based on
the original by Dmitry Boyarintsev (@skalogryz).

## Changes

- The user interface is implemented in Pascal and transpiled to Javascript by pas2js. 

- In the original version, the starting game board is hardcoded. In this version, the starting board
  is generated randomly.

## Key Files

- ```lifedriver.lpr``` - user interface driver
- ```lyff.pas``` - game machine
- ```webserver.lpr``` - convenience web server

## Running

This repo contains the necessary HTML, CSS, Javascript and WebAssembly files to run.

To run, compile ```webserver.lpr``` and execute it in this directory;  ```webserver``` will serve
the content in ```htdocs```.  You could also use another web server, say, a Python one-liner.

## Building

Three compilers are required:

- Free Pascal native compiler for your platform, to compile ```webserver.lpr```.
- pas2js, to compile ```lifedriver.lpr```.
- Free Pascal WebAssembly cross compiler for your platform, to compile ```lyff.pas```.

Detailed instructions and convenience scripts, or maybe a build system, to come.

