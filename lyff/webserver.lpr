program webserver;

{$mode objfpc}{$H+}

uses
  {$ifdef unix}cmem, cthreads,{$endif}
  classes, fphttpapp, fpwebfile;

var
  currDir: String;

begin
  GetDir(0, currDir);
  TSimpleFileModule.BaseDir := currDir + '/htdocs';
  TSimpleFileModule.RegisterDefaultRoute;
  TSimpleFileModule.IndexPageName := 'main.html';
  MimeTypesFile := 'mime.types';
  Application.Port := 8000;
  Application.Threaded := true;
  Application.Initialize;
  Application.Run;
end.
