Option Explicit

Dim shell, fso, root, ps1, command

Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(fso.BuildPath(root, "scripts"), "launch-greyfield-windows.ps1")

If Not fso.FileExists(ps1) Then
  MsgBox "Greyfield Windows launch script was not found:" & vbCrLf & ps1, vbCritical, "Greyfield launch failed"
  WScript.Quit 1
End If

Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & QuoteForCommand(ps1) & " -WorkspaceRoot " & QuoteForCommand(root)
shell.Run command, 0, False

Function QuoteForCommand(value)
  QuoteForCommand = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
