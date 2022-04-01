library lyff;

// proof of concept translaction of lyff.c
{*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *}

const
  DIM = 100;
  SIZE = ((DIM + 2) * (DIM + 2) div 8);  // byte size

var
  boardA : array [0..SIZE-1] of byte;
  boardB : array [0..SIZE-1] of byte;
  board  : PByte = @boardA;

// Gets the cell on the default board.
function get_cell(x, y: integer): byte;
var
  pos : integer;
  i   : integer;
  off : integer;
begin
  pos := (y * (DIM + 2)) + x;
  i := pos div 8;
  off := 1 shl (pos mod 8);
  get_cell := board[i] and off;
end;

// Sets a cell on a board.
procedure set_cell_ref(b: PByte; x, y: integer);
var
  pos : integer;
  i   : integer;
  off : integer;
begin
  pos := (y * (DIM + 2)) + x;
  i := pos div 8;
  off := 1 shl (pos mod 8);
  b[i] := b[i] or off;
end;

// Clears a board.
procedure clear_board_ref(b: PByte);
var
  i : integer;
begin
  for i := 0 to SIZE-1 do
    b[i] := 0;
end;

// Steps through one iteration of Conway's Game of Life. Returns the number of now alive cells, or
// -1 if no cells changed this iteration: i.e., stable game.
function board_step: integer;
var
  total_alive : integer;
  change : integer;
  next   : PByte;
  alive  : byte;
  out_   : byte; 
  count  : integer;
  off    : integer;
  dx, dy : integer;
  x,y    : integer;
begin
  total_alive := 0;
  change := 0;

  // place output in A/B board
  next := @boardA;
  if (board = next) then
    next := @boardB;

  clear_board_ref(next);

  for x := 1 to DIM - 1 do begin
    for y := 1 to DIM - 1 do begin
      alive := get_cell(x, y);
      out_ := 0;

      count := 0;
      for off := 0 to 8 do begin
        if (off = 4) then continue;  // this is 'us'

        dx := (off mod 3) - 1;
        dy := (off div 3) - 1;

        if (get_cell(x + dx, y + dy)=0) then continue;
        inc(count);
        if (count > 3) then break;
      end;

      if ((count = 3) or ( (count = 2) and (alive>0))) then
        out_ := 1;

      if (out_ > 0) then begin
        set_cell_ref(next, x, y);  // TODO: hold onto index, pass around?
        inc(total_alive);
      end;
      if (out_ <> alive) then
        inc(change);

    end;
  end;

  board := next;
  if (change = 0) then
    board_step := -1  // we're stable
  else
    board_step := total_alive;
end;

// Count the total number of alive cells.
function board_count: integer;
var
  count: integer;
  v  : byte;
  i  : integer;
begin
  count := 0;
  for i := 0 to SIZE-1 do begin
    v := board[i];
    while (v>0) do begin
      count := count + v and 1;
      v := v shr 1;
    end;
  end;
  board_count := count;
end;

// Returns the pointer location of the rendered board.
function board_ref: PByte;
begin
  board_ref := board;
end;

// Clears the board.
procedure board_init();
begin
  clear_board_ref(board);

  // TODO: dummy board setup
  board[85] := 255;
  board[120] := 255;
  board[132] := 255;
  board[800] := 255;
  board[720] := 255;
  board[700] := 255;
  board[600] := 255;
  board[601] := 255;
  board[602] := 255;
  board[603] := 255;
  board[604] := 255;
  board[605] := 255;
  board[606] := 255;
end;

exports
  board_init name '_board_init',
  board_ref name '_board_ref',
  board_step name '_board_step';

end.

