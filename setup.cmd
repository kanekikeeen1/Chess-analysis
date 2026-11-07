@echo off
rem Cai mot luot moi thu de chay Chess Analysis tren Windows moi. Chay lai bao nhieu lan cung duoc.
rem Tuy chon: setup.cmd -WithPython -Torch cu130 -DumpFile C:\duong\dan\dump.sql
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1" %*
