export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === 'GET' && url.pathname === '/') {
            return new Response(getHtmlContent(), {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' },
            });
        }

        if (request.method === 'POST' && url.pathname === '/api/deploy') {
            try {
                const { token } = await request.json();
                if (!token) throw new Error("توکن نمی‌تواند خالی باشد.");

                const headers = {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                };

                const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers });
                const accData = await accRes.json();
                
                if (!accData.success || accData.result.length === 0) {
                    throw new Error("اکانتی یافت نشد. از صحت توکن مطمئن شوید.");
                }
                
                const accountId = accData.result[0].id;

                let devSub = null;
                const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, { headers });
                const subData = await subRes.json();
                
                if (subData.success && subData.result && subData.result.subdomain) {
                    devSub = subData.result.subdomain;
                } else {
                    const newSub = `zeus-${Math.random().toString(36).substring(2, 8)}`;
                    const createSub = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ subdomain: newSub })
                    });
                    const createSubData = await createSub.json();
                    
                    if (!createSubData.success) {
                        const cfError = createSubData.errors && createSubData.errors.length > 0 ? createSubData.errors[0].message : "نامشخص";
                        throw new Error(`CF_TOS_ERROR|${cfError}`);
                    }
                    devSub = newSub;
                }

                const uniqueSuffix = Math.random().toString(36).substring(2, 8);
                const workerName = `zeus-panel-${uniqueSuffix}`;
                const dbName = `zeus-db-${uniqueSuffix}`;
                
                const dbRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: dbName })
                });
                const dbData = await dbRes.json();
                
                if (!dbData.success) {
                    const cfError = dbData.errors && dbData.errors.length > 0 ? dbData.errors[0].message : "نامشخص";
                    throw new Error(`CF_DB_ERROR|${cfError}`);
                }
                const dbUuid = dbData.result.uuid;

                await new Promise(resolve => setTimeout(resolve, 1000));

                const githubRes = await fetch("https://raw.githubusercontent.com/IR-NETLIFY/zeus/refs/heads/main/zeus.js");
                if (!githubRes.ok) throw new Error("خطا در دریافت سورس از گیت‌هاب.");
                const zeusCode = await githubRes.text();

                const metadata = {
                    main_module: "zeus.js",
                    compatibility_date: "2024-02-08",
                    bindings: [
                        { type: "d1", name: "DB", id: dbUuid },
                        { type: "secret_text", name: "CF_API_TOKEN", text: token },
                        { type: "secret_text", name: "CF_ACCOUNT_ID", text: accountId }
                    ]
                };

                const formData = new FormData();
                formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
                formData.append("zeus.js", new Blob([zeusCode], { type: "application/javascript+module" }), "zeus.js");

                const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
                    method: 'PUT',
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData
                });
                const deployData = await deployRes.json();
                
                if (!deployData.success) {
                    const cfError = deployData.errors && deployData.errors.length > 0 ? deployData.errors[0].message : "نامشخص";
                    throw new Error(`CF_DEPLOY_ERROR|${cfError}`);
                }

                const routeRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ enabled: true })
                });
                
                if (!routeRes.ok) throw new Error("خطا در فعال‌سازی لینک نهایی.");

                const finalUrl = `https://${workerName}.${devSub}.workers.dev/panel`;

                return new Response(JSON.stringify({ success: true, url: finalUrl }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (error) {
                return new Response(JSON.stringify({ success: false, error: error.message }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        return new Response("Not Found", { status: 404 });
    }
};

function getHtmlContent() {
    return `
   <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Zeus Panel Deployer</title>
        <style>
            @import url('https://v1.fontapi.ir/css/Vazir');
            
            * {
                box-sizing: border-box;
            }

            body {
                margin: 0;
                padding: 30px 15px;
                background: linear-gradient(135deg, #040814 0%, #010205 100%);
                font-family: 'Vazir', sans-serif;
                min-height: 100vh; 
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                color: #ffffff;
                overflow-y: auto;
                position: relative;
            }
            
            .glass-modal {
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 20px;
                padding: 35px 25px;
                width: 100%; 
                max-width: 370px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
                z-index: 10;
            }
            
            h2 { 
                text-align: center; 
                margin-top: 0; 
                font-weight: 700; 
                color: #ffffff;
                font-size: 22px;
            }
            p { 
                text-align: center; 
                font-size: 14px; 
                color: #a0aabf; 
                margin-bottom: 25px; 
            }
            
            .btn-secondary {
                display: block;
                text-align: center;
                margin-bottom: 20px;
                padding: 14px;
                background: #110090ff;
                border: 1px solid #1a4073;
                color: #ffffff;
                border-radius: 200px;
                text-decoration: none;
                font-size: 18px;
                font-weight: bold;
                transition: all 0.3s ease;
                width: 100%;
            }
            .btn-secondary:hover {
                background: #143666;
                box-shadow: 0 4px 12px rgba(13, 39, 77, 0.5);
            }

            input {
                width: 100%;
                padding: 15px;
                margin-bottom: 20px;
                border-radius: 220px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                background: rgba(0, 0, 0, 0.4);
                color: white;
                font-family: monospace;
                font-size: 14px;
                transition: all 0.3s ease;
                direction: ltr;
                text-align: left;
            }
            input::placeholder { color: #5c677d; text-align: right; }
            input:focus { 
                outline: none; 
                border-color: #00792dff; 
                background: rgba(0, 0, 0, 0.6);
            }
            
            .btn-primary {
                width: 100%;
                padding: 15px;
                background: #00792dff;
                border: none;
                border-radius: 100px;
                color: white;
                font-weight: bold;
                font-size: 20px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Vazir', sans-serif;
            }
            .btn-primary:hover { 
                background: #00792dff;
                box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4); 
            }
            .btn-primary:disabled { 
                opacity: 0.6; 
                cursor: not-allowed; 
            }
            
            #status-container {
                margin-top: 20px;
                display: none;
            }
            #status-text {
                font-size: 13px;
                color: #a0aabf;
                margin-bottom: 8px;
                text-align: right;
            }
            .progress-bar-bg {
                width: 100%;
                height: 6px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                overflow: hidden;
                margin-bottom: 15px;
            }
            .progress-bar-fill {
                width: 0%;
                height: 100%;
                background: #00792dff;
                border-radius: 100px;
                transition: width 0.4s ease;
            }
            #error-box {
                padding: 12px;
                background: rgba(255, 95, 86, 0.1);
                border: 2px solid #990800;
                color: #ffe6e6;
                border-radius: 20px;
                font-size: 13px;
                display: none;
                text-align: center;
                line-height: 1.6;
                margin-top: 15px;
            }
            
            .btn-success-panel {
                display: block;
                width: 100%;
                padding: 16px;
                background: #00792dff;
                color: white;
                text-align: center;
                text-decoration: none;
                font-weight: bold;
                border-radius: 100px;
                box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
                font-size: 16px;
                transition: all 0.3s ease;
            }
            .btn-success-panel:hover {
                background: #00792dff;
                transform: translateY(-2px);
            }

            .footer-container {
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                gap: 12px;
                margin-top: 35px;
                width: 100%;
                z-index: 15;
            }

            .github-footer {
                display: flex;
                align-items: center;
                gap: 8px;
                text-decoration: none;
                color: #a0aabf;
                font-size: 14px;
                font-weight: bold;
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(10px);
                padding: 10px 20px;
                border-radius: 200px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                transition: all 0.3s ease;
                direction: ltr;
            }
            .github-footer:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.1); 
                border-color: rgba(255, 255, 255, 0.4);
                transform: translateY(-3px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
            }
            .github-footer svg {
                width: 22px;
                height: 22px;
                fill: #ffffff; 
                transition: all 0.3s ease;
            }

            .telegram-footer {
                display: flex;
                align-items: center;
                gap: 8px;
                text-decoration: none;
                color: #a0aabf;
                font-size: 14px;
                font-weight: bold;
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(10px);
                padding: 10px 20px;
                border-radius: 200px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                transition: all 0.3s ease;
                direction: ltr;
            }
            .telegram-footer:hover {
                color: #ffffff;
                background: rgba(16, 185, 129, 0.1); 
                border-color: rgba(16, 185, 129, 0.4);
                transform: translateY(-3px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
            }
            .telegram-footer svg {
                width: 22px;
                height: 22px;
                fill: #229ED9;
                transition: all 0.3s ease;
            }
            .telegram-footer:hover svg {
                fill: #308658ff;
            }

@media (max-width: 480px) {
            .glass-modal {
                padding: 25px 20px;
            }
            h2 {
                font-size: 19px;
            }
            .footer-container {
                margin-top: 25px;
                flex-wrap: wrap;
            }
            .github-footer, .telegram-footer {
                padding: 8px 15px;
                font-size: 13px;
            }
            .github-footer svg, .telegram-footer svg {
                width: 18px;
                height: 18px;
            }
        }
		
.token-input-wrapper {
    position: relative;
    width: 100%;
    margin-bottom: 20px;
}

.token-input-wrapper input {
    margin-bottom: 0;
    padding-right: 45px;
}

#togglePassword {
    position: absolute;
    top: 50%;
    right: 15px;
    transform: translateY(-50%);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.3s ease;
}

#togglePassword:hover {
    opacity: 1;
}

#togglePassword svg {
    width: 20px;
    height: 20px;
    fill: #a0aabf;
}
        </style>
    </head>
    <body>
        <div class="glass-modal" id="mainCard">
            <h2> Zeus Panel Auto Deployer ⚡️</h2>
            <p>  🔋 روزانه 10 الی 100 گیگ کانفیگ رایگان </p>
            
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Zeus-Deployer-Token" target="_blank" class="btn-secondary" id="tokenBtn">
                دریافت توکن
            </a>
            
            <div class="token-input-wrapper">
                <input type="password" id="apiToken" placeholder="توکن خود را وارد کنید" autocomplete="off" spellcheck="false">
                <div id="togglePassword" onclick="toggleToken()">
                    <svg id="eyeIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                </div>
            </div>
            <button id="deployBtn" class="btn-primary" onclick="startDeploy()">ساخت پنل</button>
            
            <div id="status-container">
                <div id="status-text">شروع فرآیند... ۰٪</div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" id="progressBar"></div>
                </div>
            </div>
            <div id="error-box"></div>
        </div>

        <div class="footer-container">
            <a href="https://github.com/IR-NETLIFY/zeus/blob/main/zeus%20deployer.js" target="_blank" class="github-footer">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                سورس کد
            </a>

            <a href="https://t.me/IR_NETLIFY" target="_blank" class="telegram-footer">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                @IR_NETLIFY
            </a>
        </div>

        <script>
            function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function toggleToken() {
    const tokenInput = document.getElementById('apiToken');
    const eyeIcon = document.getElementById('eyeIcon');
    
    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        eyeIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
    } else {
        tokenInput.type = 'password';
        eyeIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
    }
}
            async function startDeploy() {
                const token = document.getElementById('apiToken').value.trim();
                const btn = document.getElementById('deployBtn');
                const statusContainer = document.getElementById('status-container');
                const statusText = document.getElementById('status-text');
                const progressBar = document.getElementById('progressBar');
                const errorBox = document.getElementById('error-box');
                
                const oldText = document.getElementById('successTxt');
                if (oldText) oldText.remove();

                const oldSuccessLink = document.getElementById('successBtn');
                if (oldSuccessLink) oldSuccessLink.remove();
                
                if(!token) {
                    errorBox.style.display = 'block';
                    errorBox.innerText = 'لطفاً ابتدا توکن را وارد کنید.';
                    return;
                }
                
                errorBox.style.display = 'none';
                btn.disabled = true;
                document.getElementById('apiToken').disabled = true;
                btn.innerText = 'در حال پردازش...';
                statusContainer.style.display = 'block';

                statusText.innerText = 'در حال بررسی توکن... ۱۵٪';
                progressBar.style.width = '15%';
                await sleep(500);

                statusText.innerText = 'در حال ایجاد ارتباط با کلودفلر... ۳۰٪';
                progressBar.style.width = '30%';
                await sleep(500);

                statusText.innerText = 'در حال ایجاد ساب‌دامین و دیتابیس D1... ۵۰٪';
                progressBar.style.width = '50%';

                try {
                    const response = await fetch('/api/deploy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token })
                    });
                    
                    statusText.innerText = 'در حال دریافت و آپلود پنل زئوس... ۷۵٪';
                    progressBar.style.width = '75%';
                    await sleep(600);

                    statusText.innerText = 'در حال فعال‌سازی لینک نهایی... ۹۰٪';
                    progressBar.style.width = '90%';
                    await sleep(500);
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        progressBar.style.width = '100%';
                        statusText.innerText = 'تکمیل شد! ۱۰۰٪';
                        await sleep(400);

                        statusContainer.style.display = 'none';

                        const successText = document.createElement('div');
                        successText.id = 'successTxt';
                        successText.innerText = 'پنل با موفقیت ساخته شد';
                        successText.style.color = '#059669'; 
                        successText.style.textAlign = 'center';
                        successText.style.marginTop = '20px'; 
                        successText.style.fontWeight = 'bold';
                        successText.style.fontSize = '14px';
                        document.getElementById('mainCard').appendChild(successText);

                        const successLink = document.createElement('a');
                        successLink.href = result.url;
                        successLink.target = '_blank';
                        successLink.className = 'btn-success-panel';
                        successLink.id = 'successBtn'; 
                        successLink.innerText = 'ورود به پنل';
                        successLink.style.marginTop = '12px';
                        
                        document.getElementById('mainCard').appendChild(successLink);
                    } else {
                        throw new Error(result.error);
                    }
                } catch(e) {
                    statusContainer.style.display = 'none';
                    errorBox.style.display = 'block';

                    btn.disabled = false;
                    document.getElementById('apiToken').disabled = false;
                    btn.innerText = 'ساخت پنل';

                    const errorMsg = e.message;
                    const rawError = errorMsg.includes('|') ? errorMsg.split('|')[1] : errorMsg;
                    
                    if (errorMsg.includes("databases per account") || errorMsg.includes("limit reached")) {
                        errorBox.innerHTML = '<div style="margin-bottom: 8px;">شما به سقف مجاز ساخت دیتابیس D1 (۱۰ عدد) رسیده‌اید. لطفاً وارد بخش Storage & Databases شده و یکی از دیتابیس‌های قبلی را حذف کنید.</div>' +
                            '<div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px; direction: ltr; word-wrap: break-word;">' + rawError + '</div>' +
                            '<a href="https://dash.cloudflare.com/?to=/:account/workers/d1" target="_blank" style="display: inline-block; background: #ff5f56; color: white; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 12px;">مدیریت دیتابیس‌های D1</a>';
                    }
                    else if (errorMsg.includes("script limit") || errorMsg.includes("scripts per account")) {
                        errorBox.innerHTML = '<div style="margin-bottom: 8px;">شما به سقف مجاز ساخت ورکر (۱۰۰ عدد) رسیده‌اید. لطفاً یکی از ورکرهای قبلی خود را حذف کنید.</div>' +
                            '<div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px; direction: ltr; word-wrap: break-word;">' + rawError + '</div>' +
                            '<a href="https://dash.cloudflare.com/?to=/:account/workers/services" target="_blank" style="display: inline-block; background: #ff5f56; color: white; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 12px;">مدیریت ورکرها</a>';
                    }
                    else if (errorMsg.includes("اکانتی یافت نشد") || errorMsg.includes("Authentication") || errorMsg.includes("Invalid")) {
                        errorBox.innerHTML = '<div style="margin-bottom: 8px;">توکن وارد شده نامعتبر است یا دسترسی‌های لازم را ندارد. لطفاً توکن جدیدی ایجاد کنید.</div>' +
                            '<div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px; direction: ltr; word-wrap: break-word;">' + rawError + '</div>' +
                            '<a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" style="display: inline-block; background: #ff5f56; color: white; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 12px;">مدیریت توکن‌ها</a>';
                    }
                    else if (errorMsg.includes("CF_TOS_ERROR") || errorMsg.includes("CF_DB_ERROR") || errorMsg.includes("CF_DEPLOY_ERROR")) {
                        if (errorMsg.includes("email") || errorMsg.includes("verify")) {
                            errorBox.innerHTML = '<div style="margin-bottom: 8px;">ابتدا باید آدرس ایمیل خود را در تنظیمات کلودفلر تایید (Verify) کنید.</div>' +
                                '<div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px; direction: ltr; word-wrap: break-word;">' + rawError + '</div>' +
                                '<a href="https://dash.cloudflare.com/profile" target="_blank" style="display: inline-block; background: #ff5f56; color: white; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 12px;">تایید ایمیل در پروفایل</a>';
                        } else {
                            errorBox.innerHTML = '<div style="margin-bottom: 8px;">باید قوانین کلودفلر ورکرز را تایید کنید. لطفاً وارد داشبورد شوید.</div>' +
                                '<div style="font-size: 11px; opacity: 0.7; margin-bottom: 12px; direction: ltr; word-wrap: break-word;">' + rawError + '</div>' +
                                '<a href="https://dash.cloudflare.com/?to=/:account/workers/overview" target="_blank" style="display: inline-block; background: #ff5f56; color: white; padding: 8px 15px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 12px;">ورود به کلودفلر</a>';
                        }
                    } else {
                        errorBox.innerText = errorMsg;
                    }
                }
            }
        </script>
    </body>
    </html>
    `;
}
