@echo off
setlocal enabledelayedexpansion
title ESport360 - Khoi dong he thong
color 0A
chcp 65001 >nul

echo ==========================================================
echo    ESport360 - Script khoi dong tu dong (backend + web)
echo ==========================================================
echo.

REM Thu muc chua file .bat nay (phai nam CUNG CAP voi 2 thu muc backend/ va e360sport/)
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%e360sport"

REM --------------------------------------------------------
REM 1. Kiem tra Node.js da duoc cai dat chua
REM --------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js tren may nay.
    echo        Vui long cai dat Node.js ^(ban LTS^) tai: https://nodejs.org/
    echo        Cai xong hay chay lai file nay.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Da tim thay Node.js %NODE_VER%

REM --------------------------------------------------------
REM 2. Kiem tra cau truc thu muc du an
REM --------------------------------------------------------
if not exist "%BACKEND%\package.json" (
    echo [LOI] Khong tim thay thu muc "backend" ben canh file .bat nay.
    echo        Hay dat file nay ngay trong thu muc goc cua du an ^(EXE101\^),
    echo        cung cap voi 2 thu muc con: backend\ va e360sport\
    echo.
    pause
    exit /b 1
)
if not exist "%FRONTEND%\package.json" (
    echo [LOI] Khong tim thay thu muc "e360sport" ben canh file .bat nay.
    echo.
    pause
    exit /b 1
)
echo [OK] Cau truc du an hop le.
echo.

REM --------------------------------------------------------
REM 3. Cai dat thu vien BACKEND (chi chay neu chua co node_modules)
REM --------------------------------------------------------
if not exist "%BACKEND%\node_modules" (
    echo [...] Lan dau chay: dang cai thu vien cho BACKEND, vui long doi ^(co the mat vai phut^)...
    pushd "%BACKEND%"
    call npm install
    if errorlevel 1 (
        echo [LOI] Cai dat thu vien BACKEND that bai. Kiem tra lai ket noi mang roi thu lai.
        popd
        pause
        exit /b 1
    )
    popd
    echo [OK] Cai dat BACKEND xong.
) else (
    echo [OK] BACKEND da co san thu vien ^(bo qua npm install^).
)
echo.

REM --------------------------------------------------------
REM 4. Cai dat thu vien FRONTEND (chi chay neu chua co node_modules)
REM --------------------------------------------------------
if not exist "%FRONTEND%\node_modules" (
    echo [...] Lan dau chay: dang cai thu vien cho FRONTEND, vui long doi ^(co the mat vai phut^)...
    pushd "%FRONTEND%"
    call npm install
    if errorlevel 1 (
        echo [LOI] Cai dat thu vien FRONTEND that bai. Kiem tra lai ket noi mang roi thu lai.
        popd
        pause
        exit /b 1
    )
    popd
    echo [OK] Cai dat FRONTEND xong.
) else (
    echo [OK] FRONTEND da co san thu vien ^(bo qua npm install^).
)
echo.

REM --------------------------------------------------------
REM 5. Tao file .env cho BACKEND neu chua co (may moi tai ve se chua co)
REM --------------------------------------------------------
if not exist "%BACKEND%\.env" (
    echo [...] Chua co file backend\.env, dang tao cau hinh mac dinh...

    REM Tao chuoi JWT_SECRET ngau nhien bang PowerShell (an toan hon %RANDOM%)
    for /f "usebackq tokens=*" %%s in (`powershell -NoProfile -Command "([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))"`) do set "JWT_SECRET_GEN=%%s"
    if "!JWT_SECRET_GEN!"=="" set "JWT_SECRET_GEN=e360sport_dev_secret_%RANDOM%%RANDOM%%RANDOM%"

    (
        echo PORT=9999
        echo MONGO_URI=mongodb://127.0.0.1:27017/ESport360
        echo JWT_SECRET=!JWT_SECRET_GEN!
        echo JWT_EXPIRES_IN=7d
        echo CLIENT_URL=http://localhost:5173
        echo SERVER_URL=http://localhost:9999
        echo UPLOAD_DIR=uploads
        echo NODE_ENV=development
        echo.
        echo ADMIN_NAME=Admin
        echo ADMIN_EMAIL=admin@esport360.local
        echo ADMIN_PASSWORD=Admin@12345
        echo ADMIN_PHONE=0900000000
        echo.
        echo # VNPay ^(dien sau khi dang ky merchant tai vnpay.vn^)
        echo VNP_TMN_CODE=
        echo VNP_HASH_SECRET=
        echo VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
        echo VNP_API_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
        echo.
        echo # MoMo ^(dien sau khi dang ky merchant tai business.momo.vn^)
        echo MOMO_PARTNER_CODE=
        echo MOMO_ACCESS_KEY=
        echo MOMO_SECRET_KEY=
        echo MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create
        echo MOMO_REFUND_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/refund
    ) > "%BACKEND%\.env"

    echo [OK] Da tao backend\.env voi cau hinh mac dinh.
    echo        --^> Tai khoan quan tri mac dinh:
    echo            Email    : admin@esport360.local
    echo            Mat khau : Admin@12345
    echo        ^(Doi mat khau nay sau khi dang nhap lan dau. Co the sua truc tiep
    echo         trong backend\.env truoc khi chay neu muon dung thong tin khac.^)
) else (
    echo [OK] Da co san backend\.env ^(giu nguyen cau hinh cu^).
)
echo.

REM --------------------------------------------------------
REM 6. Tao file .env cho FRONTEND neu chua co
REM --------------------------------------------------------
if not exist "%FRONTEND%\.env" (
    echo VITE_API_URL=http://localhost:9999/api> "%FRONTEND%\.env"
    echo [OK] Da tao e360sport\.env.
) else (
    echo [OK] Da co san e360sport\.env.
)
echo.

REM --------------------------------------------------------
REM 7. Dam bao thu muc uploads ton tai (noi luu anh tai len)
REM --------------------------------------------------------
if not exist "%BACKEND%\uploads" mkdir "%BACKEND%\uploads"

REM --------------------------------------------------------
REM 8. Kiem tra MongoDB co dang chay tren cong 27017 khong
REM --------------------------------------------------------
echo [...] Dang kiem tra MongoDB tai 127.0.0.1:27017...
powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',27017); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
    echo [CANH BAO] Chua ket noi duoc MongoDB tren cong 27017.
    echo    Thu khoi dong dich vu MongoDB neu da cai dat truoc do...
    net start MongoDB >nul 2>nul
    timeout /t 3 >nul

    powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',27017); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
    if errorlevel 1 (
        echo.
        echo [CANH BAO] Van chua ket noi duoc MongoDB. Backend co the se khong hoat dong.
        echo    Cach 1: Cai MongoDB Community Server tai:
        echo            https://www.mongodb.com/try/download/community
        echo            ^(cai xong no thuong tu chay nhu 1 Windows Service, chi can chay lai file nay^)
        echo    Cach 2: Dung MongoDB Atlas ^(cloud, mien phi^) - sua dong MONGO_URI
        echo            trong file backend\.env thanh chuoi ket noi Atlas cua ban.
        echo.
        echo    Script se van tiep tuc khoi dong, nhung backend se bao loi neu chua co DB.
        echo.
        pause
    ) else (
        echo [OK] MongoDB da san sang.
    )
) else (
    echo [OK] MongoDB dang chay.
)
echo.

REM --------------------------------------------------------
REM 9. Tao tai khoan quan tri dau tien (an toan de chay lai nhieu lan)
REM --------------------------------------------------------
echo [...] Dang kiem tra / tao tai khoan quan tri dau tien...
pushd "%BACKEND%"
call npm run seed
popd
echo.

REM --------------------------------------------------------
REM 9b. Chuan bi du lieu cho tinh nang CHUYEN SAN (bat buoc, an toan chay lai)
REM     - Dung khoa khung gio (SlotLock) cho cac don da co san
REM     - Neu thieu buoc nay, tinh nang chong dat trung khung gio chi
REM       bao ve duoc don MOI, khong bao ve duoc don da ton tai truoc do.
REM --------------------------------------------------------
echo [...] Dang chuan bi du lieu cho tinh nang chuyen san ^(migrate^)...
pushd "%BACKEND%"
call npm run migrate
if errorlevel 1 (
    echo [CANH BAO] Buoc migrate gap loi - co the do MongoDB chua san sang.
    echo    He thong van tiep tuc khoi dong, nhung hay chay lai bang tay sau:
    echo        cd backend ^&^& npm run migrate
) else (
    echo [OK] Da chuan bi xong du lieu chuyen san.
)
popd
echo.

REM --------------------------------------------------------
REM 10. Khoi dong BACKEND trong cua so rieng
REM --------------------------------------------------------
echo [...] Dang khoi dong BACKEND tai http://localhost:9999 ...
start "ESport360 - BACKEND (dong cua so nay de tat)" /D "%BACKEND%" cmd /k "npm run dev"

timeout /t 5 >nul

REM --------------------------------------------------------
REM 11. Khoi dong FRONTEND trong cua so rieng
REM --------------------------------------------------------
echo [...] Dang khoi dong FRONTEND tai http://localhost:5173 ...
start "ESport360 - FRONTEND (dong cua so nay de tat)" /D "%FRONTEND%" cmd /k "npm run dev"

timeout /t 6 >nul
start http://localhost:5173

echo.
echo ==========================================================
echo   ESport360 da khoi dong xong!
echo     Frontend : http://localhost:5173
echo     Backend  : http://localhost:9999
echo.
echo   2 cua so moi vua mo la BACKEND va FRONTEND dang chay -
echo   KHONG dong chung neu con muon dung web. Dong chung lai
echo   se tat server tuong ung.
echo.
echo   LUU Y VE TINH NANG CHUYEN SAN:
echo   - Neu chay that ^(khong phai may ca nhan de test^), MongoDB can
echo     duoc cau hinh dang replica set thi giao dich chuyen san moi
echo     chay dung. Chay tren may don le van duoc de phat trien/test,
echo     he thong se tu canh bao trong cua so BACKEND.
echo   - Muon hoan tien tu dong qua VNPay/MoMo, dien them thong tin
echo     merchant that vao backend\.env ^(VNP_TMN_CODE, MOMO_SECRET_KEY...^).
echo     Chua dien thi he thong van chay binh thuong, hoan tien se
echo     chuyen sang xu ly thu cong tai trang Quan tri - Hoan tien.
echo ==========================================================
echo.
pause
