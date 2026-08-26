@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在停止占用端口的进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174') do (
    echo 正在结束进程 PID: %%a
    taskkill /F /PID %%a 2>nul
)
echo 启动预览服务器（端口 5174）...
npx vite preview --port 5174 --strictPort
echo.
pause