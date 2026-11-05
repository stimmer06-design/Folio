@echo off
rem Andromeda Assembly launcher - opens the game in a clean app window (Microsoft Edge),
rem falling back to the default browser.
start "" msedge --app="%~dp0AndromedaAssembly.html" --start-maximized 2>nul
if errorlevel 1 start "" "%~dp0AndromedaAssembly.html"
