{
  This program demonstrates loading a WebAssembly binary from
  a web server and and running it within a web browser.

  This Pascal program is transpiled to Javascript by pas2js.

  Copyright 2022, Pierce Ng.
  MIT license.
}

program lifedriver;

{$mode objfpc}

uses
  classes, JS, sysutils, wasihostapp, web, webassembly;

type
  TMyApplication = class(TWASIHostApplication)
  public
    procedure doRun; override;
  end;

const
  DIM = 100;

var
  wasmDescriptor: TStartDescriptor;
  canvas: TJSHTMLCanvasElement;
  keepPlaying: boolean;
  btnStart, btnStop, btnClear: TJSHTMLButtonElement;
  Application: TMyApplication;

function board_init(genesisDistribution: int32): int32;
begin
  board_init := int32(wasmDescriptor.Instance.exports_.Functions['board_init'].call(new(['gd', genesisDistribution])));
end;

procedure board_clear;
begin
  wasmDescriptor.Instance.exports_.Functions['board_clear'].call(nil);
end;

procedure board_step;
begin
  wasmDescriptor.Instance.exports_.Functions['board_step'].call(nil);
end;

function board_ref: NativeInt;
begin
  board_ref := NativeInt(wasmDescriptor.Instance.exports_.Functions['board_ref'].call(nil));
end;

function GetBoardBuffer: TJSUint8Array;
begin
  GetBoardBuffer := TJSUint8Array.new(wasmDescriptor.Instance.exports_.Memory.Buffer, board_ref);
end;

procedure draw;
var
  buffer: TJSUint8Array;
  data: TJSImageData;
  x, y, pos, i, offset, alive, doffset: integer;
begin
  buffer := GetBoardBuffer;
  canvas.width := DIM + 2;
  canvas.height := canvas.width;
  canvas.style.setProperty('width', IntToStr(DIM * 3) + 'px');
  canvas.style.setProperty('height', IntToStr(DIM * 3) + 'px');
  data := TJSImageData.new(canvas.width, canvas.height);
  for x := 1 to DIM do
    for y := 1 to DIM do
      begin
        pos := (y * (DIM + 2)) + x;
        i := (pos div 8) << 0;
        offset := 1 << (pos mod 8);
        alive := buffer[i] and offset;
        if alive = 0 then
          continue;
        doffset := ((y * canvas.width) + x) * 4;
        data.data[doffset + 0] := 255;
        data.data[doffset + 3] := 255;
      end;
  canvas.GetContextAs2DContext('2d').PutImageData(data, 0, 0);
end;

procedure drawLoop;
begin
  if keepPlaying then
    begin
      board_step;
      draw;
    end;
end;

function gameStart(event: TJSMouseEvent): boolean;
begin
  btnStart.disabled := true;
  btnStop.disabled := false;
  btnClear.disabled := true;
  keepPlaying := true;
  board_init(int32(12345)); // Param is currently irrelevant.
  window.SetInterval(@drawLoop, 500);
end;

function gameStop(event: TJSMouseEvent): boolean;
begin
  btnStart.disabled := false;
  btnStop.disabled := true;
  btnClear.disabled := false;
  keepPlaying := false;
end;

function gameClear(event: TJSMouseEvent): boolean;
begin
  board_clear;
  draw;
  btnStart.disabled := false;
  btnStop.disabled := true;
  btnClear.disabled := true;
end;

function wasmStart(Sender: TObject; aDescriptor: TStartDescriptor): Boolean;
begin
  wasmDescriptor := aDescriptor;
  canvas := TJSHTMLCanvasElement(document.GetElementById('canvas'));
  btnStart := TJSHTMLButtonElement(document.getElementById('btnStart')); btnStart.onClick := @gameStart;
  btnStop := TJSHTMLButtonElement(document.getElementById('btnStop')); btnStop.onClick := @gameStop;
  btnClear := TJSHTMLButtonElement(document.getElementById('btnClear')); btnClear.onClick := @gameClear;
  wasmStart := true;
end;

procedure TMyApplication.doRun;
begin
  StartWebAssembly('lyff.wasm', true, @wasmStart);
end;

begin
  Application:=TMyApplication.Create(nil);
  Application.Initialize;
  Application.Run;
end.

