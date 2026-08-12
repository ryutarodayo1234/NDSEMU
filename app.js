document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const romInput = document.getElementById('rom-input');
    const btnSelectRom = document.getElementById('btn-select-rom');
    const welcomeOverlay = document.getElementById('welcome-overlay');
    const dropZone = document.getElementById('drop-zone');
    const toast = document.getElementById('msg-layer');
    const toastText = document.getElementById('msg-text');

    // --- 1. Shadow DOM スタイルの動的注入 (下揃え) ---
    function injectShadowStyles() {
        if (player && player.shadowRoot) {
            if (player.shadowRoot.querySelector('style')) return;

            const style = document.createElement('style');
            style.textContent = `
                #player {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end; /* 画面下揃え */
                    gap: 12px;
                    width: 100%;
                    height: 100%;
                    padding-bottom: max(16px, env(safe-area-inset-bottom)); /* iOSホームバーとの干渉防止 */
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
                }
                #top {
                    border: 2px solid rgba(255, 255, 255, 0.1);
                }
                #bottom {
                    border: 2px solid #00f0ff;
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

    // --- 3. ROMロード & 自動保存 ---
    btnSelectRom.addEventListener('click', () => romInput.click());
    
    romInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadRomFile(e.target.files[0], e.target.files[0].name, false);
        }
    });

    // ドラッグ＆ドロップ対応
    ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files.length > 0) {
            loadRomFile(dt.files[0], dt.files[0].name, false);
        }
    });

    function loadRomFile(file, name, isAutoResume = false) {
        if (!name.toLowerCase().endsWith('.nds')) {
            showToast('有効な .nds ファイルを選択してください。');
            return;
        }

        showToast(isAutoResume ? '前回のゲームを起動中...' : 'ROMをロード中...');
        
        if (!isAutoResume) {
            saveRomToStorage(file, name);
        }

        const blobUrl = URL.createObjectURL(file);

        if (player && typeof player.loadURL === 'function') {
            player.loadURL(blobUrl, () => {
                // ウェルカムオーバーレイをフェードアウト
                welcomeOverlay.style.opacity = '0';
                setTimeout(() => {
                    welcomeOverlay.style.display = 'none';
                }, 300);

                unlockAudio();
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            });
        }
    }

    async function saveRomToStorage(fileBlob, name) {
        try {
            await localforage.setItem('saved_rom', fileBlob);
            await localforage.setItem('saved_rom_name', name);
            showToast('ROMを保存しました！');
        } catch (e) {
            console.error("ROM保存エラー:", e);
        }
    }

    async function checkAndAutoStart() {
        try {
            const savedRomName = await localforage.getItem('saved_rom_name');
            const savedRom = await localforage.getItem('saved_rom');
            
            if (savedRomName && savedRom) {
                // UI表示を自動ロード中に書き換える
                document.querySelector('.upload-content h2').textContent = '自動起動中...';
                document.querySelector('.drop-text').textContent = savedRomName;
                document.querySelector('.or-text').style.display = 'none';
                btnSelectRom.style.display = 'none';
                
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

    // --- 5. iOS Safari ズーム・スクロール無効化 ---
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

    checkAndAutoStart();
});
