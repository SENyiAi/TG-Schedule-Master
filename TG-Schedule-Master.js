// ==UserScript==
// @name         Telegram Web K - 全自动进货宏
// @namespace    http://tampermonkey.net/
// @version      22.0
// @description  支持自定义天数 + 随机延迟。基于v20内核，降低封控风险。
// @author       SENyiAi
// @match        https://web.telegram.org/k/*
// @match        https://web.telegram.org/a/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // === ⚙️ 配置区域 ===
    const HOTKEY_CHAR = 'q'; // 快捷键 Alt + Q
    
    // 随机延迟范围 (毫秒)
    // 建议：最小不要低于 800，最大根据耐心设定。
    const RANDOM_MIN = 800;  // 最快 0.8秒
    const RANDOM_MAX = 2000; // 最慢 2.0秒

    // === 日志系统 ===
    let logger = null;
    function log(msg, type='info') {
        if (!logger) createLogger();
        logger.add(msg, type);
    }

    document.addEventListener('keydown', function(e) {
        if (e.altKey && e.key.toLowerCase() === HOTKEY_CHAR) {
            e.preventDefault();
            e.stopPropagation();
            if (!logger) createLogger();
            logger.clear();
            startMacro();
        }
    });

    async function startMacro() {
        log("v22.0启动");
        
        let inputField = document.activeElement;
        // 智能焦点检测
        if (!inputField || !inputField.classList.contains('input-message-input')) {
             const potentialInput = document.querySelector('.input-message-input');
             if (potentialInput) {
                 inputField = potentialInput;
             } else {
                 log("❌ 错误：未聚焦输入框！");
                 alert("请先点击输入框！");
                 return;
             }
        }

        // --- 交互询问环节 ---
        
        // 1. 问内容
        const text = prompt("🤖 步骤 1/2：请输入签到内容", "/sign");
        if (!text) return;

        // 2. 问天数
        const daysInput = prompt("📅 步骤 2/2：请输入进货天数 (例如 30, 60, 90)", "30");
        const totalDays = parseInt(daysInput, 10);
        
        if (isNaN(totalDays) || totalDays <= 0) {
            alert("❌ 天数无效，请输入数字！");
            return;
        }

        log(`📝 内容: "${text}"`);
        log(`📅 计划: ${totalDays} 天`);
        log(`🎲 延迟: ${RANDOM_MIN}~${RANDOM_MAX}ms 随机`);

        // --- 开始循环 ---
        for (let i = 1; i <= totalDays; i++) {
            inputField.focus(); 
            
            try {
                const success = await scheduleForDay(inputField, text, i);
                if (!success) {
                    log(`❌ 第 ${i} 天失败，脚本停止。`, "error");
                    return; 
                }
            } catch (err) {
                log(`❌ 异常: ${err.message}`, "error");
                return;
            }
            
            // 进度显示
            if (i % 5 === 0 || i === totalDays) {
                log(`>>> 进度: ${i} / ${totalDays}`);
            }

            // --- 随机等待 ---
            if (i < totalDays) { // 最后一天不需要等待
                const delay = Math.floor(Math.random() * (RANDOM_MAX - RANDOM_MIN + 1)) + RANDOM_MIN;
                // 在控制台不刷屏，只在后台等待
                await sleep(delay);
            }
        }

        log("🎉 任务全部完成！");
    }

    async function scheduleForDay(inputField, text, dayOffset) {
        // 1. 极速输入
        inputField.focus();
        while (inputField.firstChild) inputField.removeChild(inputField.firstChild);
        inputField.appendChild(document.createTextNode(text));
        inputField.classList.remove('is-empty');
        inputField.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50); // 极短输入冷却

        // 2. 寻找图标
        let targetBtn = null;
        const icons = Array.from(document.querySelectorAll('.tgico-schedule, .tgico-send'));
        const visibleIcons = icons.filter(el => el.offsetParent !== null);
        
        if (visibleIcons.length > 0) {
            targetBtn = visibleIcons[visibleIcons.length - 1];
        } else {
            const btns = document.querySelectorAll('.btn-send.schedule');
            for (let b of btns) {
                if (b.offsetParent !== null) { targetBtn = b; break; }
            }
        }

        if (targetBtn) {
            const clickTarget = targetBtn.closest('button') || targetBtn;
            await simulatePointerClick(clickTarget);
        } else {
            // 盲点兜底
            const rect = inputField.getBoundingClientRect();
            const blindEl = document.elementFromPoint(rect.right + 50, rect.top + 20);
            if (blindEl) await simulatePointerClick(blindEl);
        }

        // 3. 等待日历
        const calendar = await waitForElement('.popup-date-picker, .popup-schedule', 1500);
        if (!calendar) {
            log("❌ 日历未弹出", "error");
            return false; 
        }

        // 4. 日期计算
        const now = new Date();
        const targetDate = new Date();
        targetDate.setDate(now.getDate() + dayOffset);
        
        const targetDay = targetDate.getDate();
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();
        let monthDiff = (targetYear - now.getFullYear()) * 12 + (targetMonth - now.getMonth());

        // 5. 翻页
        if (monthDiff > 0) {
            const nextBtn = calendar.querySelector('.date-picker-next');
            while (monthDiff > 0 && nextBtn) {
                await simulatePointerClick(nextBtn);
                monthDiff--;
                await sleep(100); 
            }
        }

        // 6. 点击日期
        const dateBtns = Array.from(calendar.querySelectorAll('.date-picker-month-date'));
        let targetBtnDate = null;
        for (let btn of dateBtns) {
            const txt = btn.innerText.trim();
            if (txt === targetDay.toString()) {
                const index = dateBtns.indexOf(btn);
                if (targetDay > 20 && index < 7) continue; 
                if (targetDay < 7 && index > 28) continue;
                targetBtnDate = btn;
                break;
            }
        }

        if (targetBtnDate) {
            await simulatePointerClick(targetBtnDate);
        } else {
            log(`⚠️ 找不到日期: ${targetDay}`);
            return false;
        }

        // 7. 点击确认
        const confirmBtn = calendar.querySelector('.btn-primary.btn-color-primary') || 
                           calendar.querySelector('button.btn-primary');
        if (confirmBtn) {
            await simulatePointerClick(confirmBtn);
            return true;
        }
        return false;
    }

    // --- 物理点击 ---
    async function simulatePointerClick(element) {
        if (!element) return;
        const events = [
            new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }),
            new MouseEvent('mousedown', { bubbles: true }),
            new PointerEvent('pointerup', { bubbles: true, isPrimary: true }),
            new MouseEvent('mouseup', { bubbles: true }),
            new MouseEvent('click', { bubbles: true })
        ];
        for (let e of events) element.dispatchEvent(e);
        await sleep(10);
    }

    function waitForElement(selector, timeout) {
        return new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(interval);
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 30);
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function createLogger() {
        const div = document.createElement('div');
        div.style.cssText = `position: fixed; top: 10px; right: 10px; width: 220px; height: 180px; background: rgba(0,0,0,0.8); color: lime; font-family: monospace; font-size: 11px; z-index: 999999; padding: 10px; overflow-y: auto; pointer-events: none; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);`;
        document.body.appendChild(div);
        logger = {
            add: (text, type) => {
                const line = document.createElement('div');
                line.style.color = type === 'error' ? '#ff5555' : '#55ff55';
                line.innerText = `> ${text}`;
                div.appendChild(line);
                div.scrollTop = div.scrollHeight;
            },
            clear: () => div.innerHTML = ''
        };
    }
})();
