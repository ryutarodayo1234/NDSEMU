document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const romInput = document.getElementById('rom-input');
    const btnSelectRom = document.getElementById('btn-select-rom');
    const welcomeOverlay = document.getElementById('welcome-overlay');
    const dropZone = document.getElementById('drop-zone');
    const fpsDisplay = document.getElementById('fps-display');
    const toast = document.getElementById('msg-layer');
    const toastText = document.getElementById('msg-text');

    // 設定トグル要素
    const cfgPowerSave = document.getElementById('cfg-power-save');
    const cfgMute = document.getElementById('cfg-mute');
    const cfgSwapScreen = document.getElementById('cfg-swap-screen');

    // --- 1. Shadow DOM スタイルの動的注入 ---
    function injectShadowStyles() {
        if (player && player.shadowRoot) {
            // すでにスタイルがあるか確認
            if (player.shadowRoot.querySelector('style')) return;

            const style = document.createElement('style');
            style.textContent = `
                #player {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    width: 100%;
                    height: 100%;
                }
                canvas {
                    image-rendering: pixelated;
                    width: 100%;
                    max-width: 100%;
                    height: auto;
                    aspect-ratio: 256 / 192;
                    border-radius: 12px;
                    background-color: #000000;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    transition: transform 0.3s ease, border-color 0.3s ease;
                }
                #top {
                    border: 2px solid rgba(255, 255, 255, 0.1);
                }
                #bottom {
                    border: 2px solid #00f0ff;
                    box-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
                }
                /* タッチ中またはペン操作時の視覚フィードバック */
                #bottom:active {
                    border-color: #bc13fe;
                    box-shadow: 0 0 20px rgba(188, 19, 254, 0.5);
                }
            `;
            player.shadowRoot.appendChild(style);
        }
    }

    // Shadow DOM がアタッチされるのを監視 (Desmondが動的にアタッチするため)
    const observer = new MutationObserver((mutations) => {
        if (player && player.shadowRoot) {
            injectShadowStyles();
            observer.disconnect();
        }
    });
    if (player) {
        observer.observe(player, { attributes: true, childList: true });
        // すでに存在していれば即座に適用
        if (player.shadowRoot) {
            injectShadowStyles();
            observer.disconnect();
        }
    }

    // --- 2. トースト表示関数 ---
    function showToast(message, duration = 3000) {
        toastText.textContent = message;
        toast.hidden = false;
        toast.style.opacity = '1';
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.hidden = true;
            }, 300);
        }, duration);
    }

    // --- 3. ROM選択 & 読み込みロジック ---
    btnSelectRom.addEventListener('click', () => romInput.click());
    
    romInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadRomFile(e.target.files[0]);
        }
    });

    // ドラッグ＆ドロップ対応
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            loadRomFile(files[0]);
        }
    });

    function loadRomFile(file) {
        if (!file.name.toLowerCase().endsWith('.nds')) {
            showToast('有効な .nds ファイルを選択してください。');
            return;
        }

        showToast('ROMをロードしています...');
        const blobUrl = URL.createObjectURL(file);

        // Desmond のロード関数を呼び出し
        if (player && typeof player.loadURL === 'function') {
            player.loadURL(blobUrl, () => {
                showToast('ゲームが起動しました！');
                
                // PWA起動時は案内を非表示に
                if (window.navigator.standalone) {
                    document.getElementById('pwa-hint').style.display = 'none';
                }

                // ウェルカムオーバーレイをフェードアウト
                welcomeOverlay.style.opacity = '0';
                setTimeout(() => {
                    welcomeOverlay.style.display = 'none';
                }, 300);

                // 音声コンテキストのアンロック
                unlockAudio();

                // FPSカウンターの開始
                startFpsCounter();

                // リソース解放
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            });
        } else {
            showToast('エミュレータの初期化に失敗しました。再読み込みしてください。');
        }
    }

    // --- 4. Safari 音声制限解除 ---
    function unlockAudio() {
        if (window.AudioContext || window.webkitAudioContext) {
            const AudioClass = window.AudioContext || window.webkitAudioContext;
            // 既存のアクティブなコンテキストのresumeを試みる
            // (desmond.min.js内のコンテキストをアンロックするため、ダミーのインタラクションを発生させる)
            const dummyCtx = new AudioClass();
            if (dummyCtx.state === 'suspended') {
                dummyCtx.resume().then(() => dummyCtx.close());
            }
        }
    }

    // --- 5. iOS Safari のズーム・スクロールジェスチャー制限の完全無効化 ---
    // ダブルタップズームの防止
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    // ピンチズーム（マルチタッチ）の防止
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    // 画面のバウンス（スクロール）防止
    document.addEventListener('touchmove', (e) => {
        // エミュレータ画面エリア外のスワイプによるスクロールを防ぐ
        if (!e.target.closest('desmond-player')) {
            e.preventDefault();
        }
    }, { passive: false });

    // --- 6. 設定の永続化と同期 (localStorage) ---
    function getStoredConfig() {
        try {
            return JSON.parse(localStorage.getItem('config') || '{}');
        } catch (e) {
            return {};
        }
    }

    function saveStoredConfig(config) {
        localStorage.setItem('config', JSON.stringify(config));
    }

    // UIトグルとlocalStorageの同期
    function initConfigUI() {
        const config = getStoredConfig();
        
        cfgPowerSave.checked = config.powerSave !== false; // デフォルト ON (省電力)
        cfgMute.checked = !!config.muteSound;             // デフォルト OFF
        cfgSwapScreen.checked = !!config.swapTopBottom;   // デフォルト OFF

        // イベント設定
        cfgPowerSave.addEventListener('change', (e) => {
            const cfg = getStoredConfig();
            cfg.powerSave = e.target.checked;
            saveStoredConfig(cfg);
            showToast('省電力設定を保存しました（次回起動時に反映）');
        });

        cfgMute.addEventListener('change', (e) => {
            const cfg = getStoredConfig();
            cfg.muteSound = e.target.checked;
            saveStoredConfig(cfg);
            showToast('消音設定を保存しました（次回起動時に反映）');
        });

        cfgSwapScreen.addEventListener('change', (e) => {
            const cfg = getStoredConfig();
            cfg.swapTopBottom = e.target.checked;
            saveStoredConfig(cfg);
            showToast('画面レイアウト設定を保存しました（次回起動時に反映）');
        });
    }

    initConfigUI();

    // --- 7. 自前 FPS カウンター ---
    let frameTimes = [];
    let fpsIntervalId = null;

    function startFpsCounter() {
        if (fpsIntervalId) return;

        function refreshFps() {
            const now = performance.now();
            frameTimes.push(now);
            
            // 過去1秒間のフレームのみ保持
            while (frameTimes.length > 0 && frameTimes[0] <= now - 1000) {
                frameTimes.shift();
            }

            fpsDisplay.textContent = `FPS: ${frameTimes.length}`;
            if (welcomeOverlay.style.display === 'none') {
                requestAnimationFrame(refreshFps);
            }
        }
        requestAnimationFrame(refreshFps);
    }
});
