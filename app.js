document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const romInput = document.getElementById('rom-input');
    const btnSelectRom = document.getElementById('btn-select-rom');
    const welcomeOverlay = document.getElementById('welcome-overlay');
    const dropZone = document.getElementById('drop-zone');
    const toast = document.getElementById('msg-layer');
    const toastText = document.getElementById('msg-text');

    // --- 1. Shadow DOM スタイルの動的注入 (下揃え & キャンバス制限解除) ---
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
                    padding-bottom: max(16px, env(safe-area-inset-bottom)); /* iOSホームバー回避 */
                    touch-action: none;
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
                    touch-action: none; /* Safariでのスクロール・ズームを防止 */
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

        showToast(isAutoResume ? '前回のゲームを自動起動中...' : 'ROMをロード中...');
        
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

    checkAndAutoStart();
});
