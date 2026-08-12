document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const romInput = document.getElementById('rom-input');
    const btnSelectRom = document.getElementById('btn-select-rom');
    const welcomeOverlay = document.getElementById('welcome-overlay');
    const dropZone = document.getElementById('drop-zone');
    const fpsDisplay = document.getElementById('fps-display');
    const toast = document.getElementById('msg-layer');
    const toastText = document.getElementById('msg-text');

    // 設定要素
    const cfgPowerSave = document.getElementById('cfg-power-save');
    const cfgMute = document.getElementById('cfg-mute');
    const cfgSwapScreen = document.getElementById('cfg-swap-screen');
    const btnClearRom = document.getElementById('btn-clear-rom');

    // --- 1. Shadow DOM スタイルの動的注入 ---
    function injectShadowStyles() {
        if (player && player.shadowRoot) {
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
                #bottom:active {
                    border-color: #bc13fe;
                    box-shadow: 0 0 20px rgba(188, 19, 254, 0.5);
                }
            `;
            player.shadowRoot.appendChild(style);
        }
    }

    const observer = new MutationObserver(() => {
        if (player && player.shadowRoot) {
            injectShadowStyles();
            observer.disconnect();
        }
    });
    if (player) {
        observer.observe(player, { attributes: true, childList: true });
        if (player.shadowRoot) {
            injectShadowStyles();
            observer.disconnect();
        }
    }

    // --- 2. トースト表示 ---
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

    // --- 3. ROMファイルのロード・起動・自動保存ロジック ---
    btnSelectRom.addEventListener('click', () => romInput.click());
    
    romInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadRomFile(e.target.files[0], e.target.files[0].name, false);
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
            loadRomFile(files[0], files[0].name, false);
        }
    });

    // ROMのロード処理
    function loadRomFile(file, name, isAutoResume = false) {
        if (!name.toLowerCase().endsWith('.nds')) {
            showToast('有効な .nds ファイルを選択してください。');
            return;
        }

        showToast(isAutoResume ? '前回のゲームを自動起動中...' : 'ROMをロードしています...');
        
        // 新規ロード時は IndexedDB に保存
        if (!isAutoResume) {
            saveRomToStorage(file, name);
        }

        const blobUrl = URL.createObjectURL(file);

        if (player && typeof player.loadURL === 'function') {
            player.loadURL(blobUrl, () => {
                showToast('ゲームが起動しました！');
                
                if (window.navigator.standalone) {
                    document.getElementById('pwa-hint').style.display = 'none';
                }

                // ウェルカムオーバーレイをフェードアウト
                welcomeOverlay.style.opacity = '0';
                setTimeout(() => {
                    welcomeOverlay.style.display = 'none';
                    // 予備で UI のテキストをリセットしておく
                    resetWelcomeUI();
                }, 300);

                unlockAudio();
                startFpsCounter();
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            });
        } else {
            showToast('エミュレータの初期化に失敗しました。再起動してください。');
        }
    }

    // ROMをブラウザストレージに保存する非同期関数
    async function saveRomToStorage(fileBlob, name) {
        try {
            showToast('自動起動のため、ROMをブラウザに保存中...');
            await localforage.setItem('saved_rom', fileBlob);
            await localforage.setItem('saved_rom_name', name);
            showToast('ROMをブラウザに保存しました！');
        } catch (e) {
            console.error("ROM保存エラー:", e);
            showToast('ROMの保存に失敗しました（容量不足の可能性があります）');
        }
    }

    function resetWelcomeUI() {
        document.querySelector('.upload-content h2').textContent = 'ROMファイルをロード';
        document.querySelector('.drop-text').textContent = 'ここに .nds ファイルをドラッグ＆ドロップ';
        document.querySelector('.or-text').style.display = 'block';
        btnSelectRom.style.display = 'inline-block';
    }

    // 起動時に保存されたゲームを自動ロードする
    async function checkAndAutoStart() {
        try {
            const savedRomName = await localforage.getItem('saved_rom_name');
            const savedRom = await localforage.getItem('saved_rom');
            
            if (savedRomName && savedRom) {
                // UI表示を自動ロード中に書き換える
                document.querySelector('.upload-content h2').textContent = '前回のゲームを自動起動中...';
                document.querySelector('.drop-text').textContent = savedRomName;
                document.querySelector('.or-text').style.display = 'none';
                btnSelectRom.style.display = 'none';
                
                // 自動起動を実行
                loadRomFile(savedRom, savedRomName, true);
            }
        } catch (e) {
            console.error("自動起動確認エラー:", e);
        }
    }

    // --- 4. Safari 音声制限解除 ---
    function unlockAudio() {
        if (window.AudioContext || window.webkitAudioContext) {
            const AudioClass = window.AudioContext || window.webkitAudioContext;
            const dummyCtx = new AudioClass();
            if (dummyCtx.state === 'suspended') {
                dummyCtx.resume().then(() => dummyCtx.close());
            }
        }
    }

    // --- 5. iOS Safari のズーム・スクロールジェスチャー制限無効化 ---
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!e.target.closest('desmond-player')) {
            e.preventDefault();
        }
    }, { passive: false });

    // --- 6. 設定の永続化と同期 ---
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

    function initConfigUI() {
        const config = getStoredConfig();
        
        cfgPowerSave.checked = config.powerSave !== false;
        cfgMute.checked = !!config.muteSound;
        cfgSwapScreen.checked = !!config.swapTopBottom;

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

        // 保存されたROMの削除ボタンの処理
        if (btnClearRom) {
            btnClearRom.addEventListener('click', async () => {
                const confirmed = confirm('保存されたゲームデータを削除しますか？\n次回起動時はファイル選択が必要になります。');
                if (confirmed) {
                    try {
                        await localforage.removeItem('saved_rom');
                        await localforage.removeItem('saved_rom_name');
                        showToast('保存データを削除しました。ページをリロードします。');
                        setTimeout(() => location.reload(), 1200);
                    } catch (e) {
                        showToast('データの削除に失敗しました。');
                    }
                }
            });
        }
    }

    initConfigUI();

    // --- 7. FPS カウンター ---
    let frameTimes = [];
    function startFpsCounter() {
        function refreshFps() {
            const now = performance.now();
            frameTimes.push(now);
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

    // 自動起動の実行
    checkAndAutoStart();
});
