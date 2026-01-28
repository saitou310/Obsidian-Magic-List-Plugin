// const { Plugin } = require("obsidian");
const { Plugin, requestUrl, Modal, Setting, PluginSettingTab } = require("obsidian");


class ImageZoomModal extends Modal {
    /**
     * @param {App} app
     * @param {string} src  表示する画像URL
     * @param {string} alt  カード名など
     */
    constructor(app, src, alt = "") {
        super(app);
        this.src = src;
        this.alt = alt;
    }

    onOpen() {
        const { contentEl } = this;

        // モーダル全体のスタイル
        contentEl.empty();
        contentEl.style.padding = "0";
        contentEl.style.display = "flex";
        contentEl.style.alignItems = "center";
        contentEl.style.justifyContent = "center";
        contentEl.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
        contentEl.style.height = "100%";

        const img = document.createElement("img");
        img.src = this.src;
        img.alt = this.alt;
        img.style.maxWidth = "95vw";
        img.style.maxHeight = "95vh";
        img.style.boxShadow = "0 0 20px #000";
        img.style.borderRadius = "8px";
        img.style.cursor = "zoom-out";

        // クリックで閉じる
        img.addEventListener("click", () => this.close());
        contentEl.appendChild(img);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}


// ==============================
// 設定・共通変数
// ==============================
// ==============================
// 設定・共通変数
// ==============================

// これらは「設定」で上書きできるように、const ではなく let にしています
let CACHE_ROOT = "scryfall";
let JSON_DIR = `${CACHE_ROOT}/json`;
let IMG_DIR  = `${CACHE_ROOT}/img`;

// Bulk JSON（大きい一括JSON）のパスも、ディレクトリ設定に追従できるように let にします
let JA_ONLY_BULK_PATH = `${JSON_DIR}/ja_only.json`;
let ORACLE_BULK_PATH  = `${JSON_DIR}/oracle-cards-20251209102455.json`;

function normalizePath(p) {
    // Obsidian の vault 内パス想定（区切りを / に統一、末尾 / は削除）
    return String(p ?? "").replace(/\\/g, "/").replace(/\/+$/g, "");
}

function applyCacheDirSettings(settings) {
    const root = normalizePath(settings?.cacheRoot || "scryfall") || "scryfall";
    const jsonDir = normalizePath(settings?.jsonDir || `${root}/json`) || `${root}/json`;
    const imgDir  = normalizePath(settings?.imgDir  || `${root}/img`)  || `${root}/img`;

    CACHE_ROOT = root;
    JSON_DIR   = jsonDir;
    IMG_DIR    = imgDir;

    // 追従
    JA_ONLY_BULK_PATH = `${JSON_DIR}/ja_only.json`;
    ORACLE_BULK_PATH  = `${JSON_DIR}/oracle-cards-20251209102455.json`;
}

// ==============================
// プラグイン設定
// ==============================
const DEFAULT_SETTINGS = {
    showManaCurve: true,
    showCardTypes: true,
    showTypePie: true,
    showColorCounts: true,
    showColorPie: true,

    // ローカルキャッシュ（vault内）の保存先
    cacheRoot: "scryfall",
    jsonDir: "scryfall/json",
    imgDir: "scryfall/img",
};

class MagicListSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Magic List Plugin Settings" });

        new Setting(containerEl)
            .setName("マナカーブを表示")
            .setDesc("Deck Stats にマナカーブ（Mana Curve）を表示します。")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showManaCurve)
                    .onChange(async (value) => {
                        this.plugin.settings.showManaCurve = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("カードタイプを表示")
            .setDesc("Deck Stats にカードタイプ（Card Types）を表示します。")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showCardTypes)
                    .onChange(async (value) => {
                        this.plugin.settings.showCardTypes = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("タイプ円グラフを表示")
            .setDesc("Card Types の円グラフ（デッキ全体に対する割合）を表示します。")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showTypePie)
                    .onChange(async (value) => {
                        this.plugin.settings.showTypePie = value;
                        await this.plugin.saveSettings();
                    })
            );



new Setting(containerEl)
    .setName("色別枚数を表示")
    .setDesc("Deck Stats にカードの色（単色/多色/無色）の枚数を表示します。")
    .addToggle((toggle) =>
        toggle
            .setValue(this.plugin.settings.showColorCounts)
            .onChange(async (value) => {
                this.plugin.settings.showColorCounts = value;
                await this.plugin.saveSettings();
            })
    );

new Setting(containerEl)
    .setName("色円グラフを表示")
    .setDesc("Colors の円グラフ（デッキ全体に対する割合）を表示します。")
    .addToggle((toggle) =>
        toggle
            .setValue(this.plugin.settings.showColorPie)
            .onChange(async (value) => {
                this.plugin.settings.showColorPie = value;
                await this.plugin.saveSettings();
            })
    );




        containerEl.createEl("h3", { text: "キャッシュ保存先（Vault内パス）" });

        new Setting(containerEl)
            .setName("キャッシュルート")
            .setDesc("Scryfall キャッシュのルートフォルダ（例: scryfall）")
            .addText((text) =>
                text
                    .setPlaceholder("scryfall")
                    .setValue(this.plugin.settings.cacheRoot)
                    .onChange(async (value) => {
                        this.plugin.settings.cacheRoot = value || "scryfall";
                        // ルートが変わった場合、json/img がデフォルトのままなら追従させる
                        // （ユーザーが明示指定している場合はそのまま）
                        if (this.plugin.settings.jsonDir === "scryfall/json") {
                            this.plugin.settings.jsonDir = `${this.plugin.settings.cacheRoot}/json`;
                        }
                        if (this.plugin.settings.imgDir === "scryfall/img") {
                            this.plugin.settings.imgDir = `${this.plugin.settings.cacheRoot}/img`;
                        }
                        await this.plugin.saveSettings();
                        applyCacheDirSettings(this.plugin.settings);
                        await ensureCacheDirs();
                    })
            );

        new Setting(containerEl)
            .setName("JSON保存先")
            .setDesc("カードJSONキャッシュの保存先（例: scryfall/json）")
            .addText((text) =>
                text
                    .setPlaceholder("scryfall/json")
                    .setValue(this.plugin.settings.jsonDir)
                    .onChange(async (value) => {
                        this.plugin.settings.jsonDir = value || `${this.plugin.settings.cacheRoot}/json`;
                        await this.plugin.saveSettings();
                        applyCacheDirSettings(this.plugin.settings);
                        await ensureCacheDirs();
                    })
            );

        new Setting(containerEl)
            .setName("画像保存先")
            .setDesc("カード画像キャッシュの保存先（例: scryfall/img）")
            .addText((text) =>
                text
                    .setPlaceholder("scryfall/img")
                    .setValue(this.plugin.settings.imgDir)
                    .onChange(async (value) => {
                        this.plugin.settings.imgDir = value || `${this.plugin.settings.cacheRoot}/img`;
                        await this.plugin.saveSettings();
                        applyCacheDirSettings(this.plugin.settings);
                        await ensureCacheDirs();
                    })
            );

    }
}

// ★ 追加ここから ----------------------------
// 一括JSONをメモリにキャッシュしておく変数
let jaOnlyIndex = null;
let oracleIndex = null;

/**
 * 名前が日本語っぽいか判定（ひらがな・カタカナ・漢字）
 */
function isJapaneseName(name) {
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(name);
}

/**
 * 一括JSONからカード1件を探す共通処理
 * - 配列形式（Scryfallのbulk data標準形）
 * - 連想配列形式（name: {...}）の両方に対応
 */
function findCardInIndex(index, name) {
    if (!index || !name) return null;

    const target = name.trim().toLowerCase();

    if (Array.isArray(index)) {
        return index.find((card) => {
            const n1 = (card.name || "").toLowerCase();
            const n2 = (card.printed_name || "").toLowerCase();
            return n1 === target || n2 === target;
        }) || null;
    }

    if (typeof index === "object") {
        // nameそのまま、lowercaseキー両方試す
        return (
            index[name] ||
            index[target] ||
            null
        );
    }

    return null;
}

/**
 * ja_only.json を読み込んでキャッシュ
 */
async function loadJaOnlyIndex() {
    if (!appRef) return null;
    if (jaOnlyIndex) return jaOnlyIndex;

    const adapter = appRef.vault.adapter;
    if (!(await adapter.exists(JA_ONLY_BULK_PATH))) {
        console.warn("[MagicListPlugin] ja_only.json not found:", JA_ONLY_BULK_PATH);
        return null;
    }

    try {
        const txt = await adapter.read(JA_ONLY_BULK_PATH);
        jaOnlyIndex = JSON.parse(txt);
    } catch (e) {
        console.error("[MagicListPlugin] failed to read ja_only.json:", e);
        jaOnlyIndex = null;
    }
    return jaOnlyIndex;
}

/**
 * oracle-cards-*.json を読み込んでキャッシュ
 */
async function loadOracleIndex() {
    if (!appRef) return null;
    if (oracleIndex) return oracleIndex;

    const adapter = appRef.vault.adapter;
    if (!(await adapter.exists(ORACLE_BULK_PATH))) {
        console.warn("[MagicListPlugin] oracle bulk json not found:", ORACLE_BULK_PATH);
        return null;
    }

    try {
        const txt = await adapter.read(ORACLE_BULK_PATH);
        oracleIndex = JSON.parse(txt);
    } catch (e) {
        console.error("[MagicListPlugin] failed to read oracle bulk json:", e);
        oracleIndex = null;
    }
    return oracleIndex;
}

// ★ 追加ここまで ----------------------------


let appRef = null; // Obsidian App を外部関数から使うため
const cardImageCache = new Map(); // メモリキャッシュ（1セッション内）

// ==============================
// ユーティリティ
// ==============================

/**
 * 1枚分のカード処理
 * - JSON取得 → stats反映
 * - 画像取得 → プレースホルダ差し替え
 */
async function processSingleCardEntry(entry, stats, plugin) {
    const { name, count, itemEl, placeholderEl } = entry;

    try {
        const data = await fetchCardData(name);
        if (data) {
            const cmc = data.cmc ?? 0;
            const typeLine = data.type_line || "";
            const primaryType = getPrimaryType(typeLine);

            // 合計枚数
            stats.totalCards += count;

            // タイプ別（Land含む）
            stats.typeCounts[primaryType] =
                (stats.typeCounts[primaryType] ?? 0) + count;


// 色別（color_identity優先）
const category = getColorCategory(data.color_identity ?? data.colors ?? []);
stats.colorCounts = stats.colorCounts ?? { W:0,U:0,B:0,R:0,G:0,M:0,C:0 };
stats.colorCounts[category] =
    (stats.colorCounts[category] ?? 0) + count;

            // マナカーブは Land 以外のみ
            if (primaryType !== "Land") {
                const bucket = bucketManaCost(cmc);
                stats.manaCurve[bucket] =
                    (stats.manaCurve[bucket] ?? 0) + count;
            }
        }
    } catch (e) {
        console.warn(
            "[MagicListPlugin] failed to fetch card data for stats",
            name,
            e
        );
    }

    // 画像
    let imageUrl = null;
    try {
        imageUrl = await fetchCardImage(name);
    } catch (e) {
        console.error(
            "[MagicListPlugin] error while fetching card image",
            name,
            e
        );
    }

    // プレースホルダを消して中身を差し替え
    if (placeholderEl && placeholderEl.parentElement === itemEl) {
        itemEl.removeChild(placeholderEl);
    }

    if (!imageUrl) {
        const fallback = document.createElement("div");
        fallback.textContent = `画像取得失敗: ${name}`;
        fallback.style.fontSize = "0.9em";
        fallback.style.color = "red";
        fallback.style.padding = "4px";
        fallback.style.border =
            "1px solid var(--background-modifier-border)";
        fallback.style.borderRadius = "4px";
        fallback.style.backgroundColor =
            "var(--background-modifier-error)";
        itemEl.appendChild(fallback);
    } else {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = name;
        img.style.cursor = "zoom-in";
        img.addEventListener("click", () => {
            new ImageZoomModal(plugin.app, imageUrl, name).open();
        });
        itemEl.appendChild(img);
    }
}

/**
 * デッキ全体を並列処理
 * @param {Array<{name, count, itemEl, placeholderEl}>} entries
 */
async function processDeckEntries(entries, statsDiv, plugin) {
    const stats = createEmptyStats();

    const concurrency = 6; // 同時に走らせるカード数（お好みで）
    let index = 0;

    async function worker() {
        while (index < entries.length) {
            const i = index++;
            const entry = entries[i];
            await processSingleCardEntry(entry, stats, plugin);

            // ここでちょっとずつ再描画したかったら、
            // 例えば10枚ごとに renderDeckStats(statsDiv, stats) してもOK
        }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    // 全部終わったら最終的なスタッツを描画
    renderDeckStats(statsDiv, stats, plugin.settings);
}



// ==============================
// デッキスタッツ用ヘルパー
// ==============================

function createEmptyStats() {
    return {
        manaCurve: {},   // { "0": 3, "1": 5, ... }
        typeCounts: {},  // { "Creature": 25, "Land": 36, ... }
        colorCounts: { W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, C: 0 },
        totalCards: 0,
    };
}

/**
 * Scryfall の cmc → 表示用バケット
 * 0,1,2,3,4,5,6,7+
 */
function bucketManaCost(cmc) {
    if (cmc == null || isNaN(cmc) || cmc < 0) return "0";
    if (cmc >= 7) return "7+";
    return String(Math.floor(cmc));
}

/**
 * type_line から代表タイプをざっくり決める
 */
function getPrimaryType(typeLine) {
    if (!typeLine) return "Other";
    if (typeLine.includes("Land")) return "Land";
    if (typeLine.includes("Creature")) return "Creature";
    if (typeLine.includes("Instant")) return "Instant";
    if (typeLine.includes("Sorcery")) return "Sorcery";
    if (typeLine.includes("Artifact")) return "Artifact";
    if (typeLine.includes("Enchantment")) return "Enchantment";
    if (typeLine.includes("Planeswalker")) return "Planeswalker";
    if (typeLine.includes("Battle")) return "Battle";
    return "Other";
}


/**
 * color_identity から色カテゴリを返す
 * - 0色: "C" (Colorless)
 * - 1色: "W/U/B/R/G"
 * - 2色以上: "M" (Multicolor)
 * @param {string[]|null|undefined} colorIdentity
 */
function getColorCategory(colorIdentity) {
    const ci = Array.isArray(colorIdentity) ? colorIdentity.filter(Boolean) : [];
    if (ci.length === 0) return "C";
    if (ci.length === 1) return ci[0]; // "W" 等
    return "M";
}

function getColorLabel(key) {
    switch (key) {
        case "W": return "白";
        case "U": return "青";
        case "B": return "黒";
        case "R": return "赤";
        case "G": return "緑";
        case "M": return "多色";
        case "C": return "無色";
        default: return key;
    }
}


/**
 * SVG 円グラフを生成する
 * @param {Array<{label:string,value:number}>} items
 * @param {number} total
 * @param {{maxSlices?:number, size?:number}} opts
 */
function createPieChartElement(items, total, opts = {}) {
    const size = opts.size ?? 160;
    const maxSlices = opts.maxSlices ?? 8;

    // 既定のパレット（CSS の magic-pie-slice-* と合わせる）
    const defaultPalette = [
        "hsl(210 70% 55%)",
        "hsl(35 80% 55%)",
        "hsl(120 55% 45%)",
        "hsl(0 70% 55%)",
        "hsl(270 55% 60%)",
        "hsl(160 55% 45%)",
        "hsl(55 75% 50%)",
        "hsl(190 55% 55%)",
        "hsl(330 55% 60%)",
    ];
    const palette = Array.isArray(opts.palette) && opts.palette.length > 0 ? opts.palette : defaultPalette;
    const labelColorMap = opts.labelColorMap && typeof opts.labelColorMap === "object" ? opts.labelColorMap : null;
    const otherColor = opts.otherColor ?? "#ccc";

    function pickColor(label, idx) {
        if (labelColorMap && label in labelColorMap) return String(labelColorMap[label]);
        if (label === "Other") return otherColor;
        return palette[idx % palette.length];
    }

    const normalized = items
        .filter((x) => (x?.value ?? 0) > 0)
        .map((x) => ({ label: String(x.label), value: Number(x.value) }))
        .sort((a, b) => b.value - a.value);

    // 多すぎる場合は Other にまとめる
    const sliced = normalized.slice(0, maxSlices);
    const rest = normalized.slice(maxSlices);
    const restSum = rest.reduce((s, x) => s + x.value, 0);
    if (restSum > 0) sliced.push({ label: "Other", value: restSum });

    const safeTotal = Math.max(1, Number(total) || 0);

    const wrap = document.createElement("div");
    wrap.className = "magic-pie-wrap";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "magic-pie");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));

    const cx = size / 2;
    const cy = size / 2;
    const r = (size / 2) - 8;

    let startAngle = -90; // 12時スタート

    sliced.forEach((item, idx) => {
        const fraction = item.value / safeTotal;
        const angle = 360 * fraction;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", `magic-pie-slice magic-pie-slice-${idx + 1}`);
        path.setAttribute("d", describeArc(cx, cy, r, startAngle, startAngle + angle));
        path.setAttribute("data-label", item.label);
        path.setAttribute("data-value", String(item.value));
        const _c = pickColor(item.label, idx);
        path.setAttribute("fill", _c);
        path.style.fill = _c;
        svg.appendChild(path);

        startAngle += angle;
    });

    wrap.appendChild(svg);

    const legend = document.createElement("div");
    legend.className = "magic-pie-legend";

    sliced.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "magic-pie-legend-row";

        const swatch = document.createElement("span");
        swatch.className = `magic-pie-swatch magic-pie-slice-${idx + 1}`;
        swatch.style.backgroundColor = pickColor(item.label, idx);

        const pct = Math.round((item.value / safeTotal) * 1000) / 10; // 0.1%
        const label = document.createElement("span");
        label.className = "magic-pie-legend-label";
        label.textContent = `${item.label}: ${item.value} (${pct}%)`;

        row.appendChild(swatch);
        row.appendChild(label);
        legend.appendChild(row);
    });

    wrap.appendChild(legend);
    return wrap;
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = (endAngle - startAngle) <= 180 ? "0" : "1";
    return [
        "M", x, y,
        "L", start.x, start.y,
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        "Z"
    ].join(" ");
}


/**
 * デッキスタッツを描画
 * @param {HTMLElement} container
 * @param {ReturnType<typeof createEmptyStats>} stats
 */
function renderDeckStats(container, stats, options = DEFAULT_SETTINGS) {
    container.innerHTML = "";
    container.classList.add("magic-deck-stats");

    const title = document.createElement("h4");
    title.textContent = "Deck Stats";
    container.appendChild(title);

    const body = document.createElement("div");
    body.className = "magic-deck-stats-body";
    container.appendChild(body);

    // ----- マナカーブ（縦棒 + 土地専用バー） -----
    const manaSection = document.createElement("div");
    manaSection.className = "magic-mana-curve-section";

    const manaTitle = document.createElement("h5");
    manaTitle.textContent = "Mana Curve";
    manaSection.appendChild(manaTitle);

    const barsWrapper = document.createElement("div");
    barsWrapper.className = "magic-mana-bars";
    manaSection.appendChild(barsWrapper);

    const order = ["0", "1", "2", "3", "4", "5", "6", "7+"];
    const landCount = stats.typeCounts["Land"] ?? 0;

    const maxCount = Math.max(
        1,
        ...order.map((k) => stats.manaCurve[k] ?? 0),
        landCount
    );

    // 共通ヘルパー：1本のバーを作る
    const createBarItem = (label, count) => {
        const item = document.createElement("div");
        item.className = "magic-mana-bar-item";

        const bar = document.createElement("div");
        bar.className = "magic-mana-bar-rect";
        const percent = (count / maxCount) * 100;
        bar.style.height = `${percent}%`;
        bar.setAttribute("data-count", String(count));
        item.appendChild(bar);

        const xlabel = document.createElement("div");
        xlabel.className = "magic-mana-bar-xlabel";
        xlabel.textContent = label;
        item.appendChild(xlabel);

        barsWrapper.appendChild(item);
    };

    // 0〜7+ のバー（土地以外）
    for (const bucket of order) {
        const count = stats.manaCurve[bucket] ?? 0;
        createBarItem(bucket, count);
    }

    // 土地専用バー
    if (landCount > 0) {
        createBarItem("Land", landCount);
    }

    if (options.showManaCurve) {
        body.appendChild(manaSection);
    }

    // ----- タイプ別枚数（表）はそのまま -----
    const typeSection = document.createElement("div");
    typeSection.className = "magic-type-section";

    const typeTitle = document.createElement("h5");
    typeTitle.textContent = "Card Types";
    typeSection.appendChild(typeTitle);

    const table = document.createElement("table");
    table.className = "magic-type-table";

    const headerRow = document.createElement("tr");
    const thType = document.createElement("th");
    thType.textContent = "Type";
    const thCount = document.createElement("th");
    thCount.textContent = "Count";
    headerRow.appendChild(thType);
    headerRow.appendChild(thCount);
    table.appendChild(headerRow);

    for (const [type, count] of Object.entries(stats.typeCounts)) {
        if (!count) continue;
        const tr = document.createElement("tr");
        const tdType = document.createElement("td");
        tdType.textContent = type;
        const tdCount = document.createElement("td");
        tdCount.textContent = String(count);
        tr.appendChild(tdType);
        tr.appendChild(tdCount);
        table.appendChild(tr);
    }

    typeSection.appendChild(table);
    // 円グラフ（デッキ全体に対する割合）
    if (options.showTypePie) {
        const typeItems = Object.entries(stats.typeCounts || {})
            .filter(([_, c]) => (c ?? 0) > 0)
            .map(([t, c]) => ({ label: t, value: c }));
        const pie = createPieChartElement(typeItems, stats.totalCards, { maxSlices: 6, size: 160 });
        pie.classList.add("magic-type-pie");
        typeSection.appendChild(pie);
    }

    if (options.showCardTypes || options.showTypePie) {
        body.appendChild(typeSection);
    }


// ----- 色別枚数（単色/多色/無色） -----
const colorSection = document.createElement("div");
colorSection.className = "magic-color-section";

const colorTitle = document.createElement("h5");
colorTitle.textContent = "Colors";
colorSection.appendChild(colorTitle);

const colorTable = document.createElement("table");
colorTable.className = "magic-color-table";

const colorHeader = document.createElement("tr");
const thColor = document.createElement("th");
thColor.textContent = "Color";
const thColorCount = document.createElement("th");
thColorCount.textContent = "Count";
colorHeader.appendChild(thColor);
colorHeader.appendChild(thColorCount);
colorTable.appendChild(colorHeader);

const colorOrder = ["W", "U", "B", "R", "G", "M", "C"];
for (const key of colorOrder) {
    const count = (stats.colorCounts?.[key]) ?? 0;
    if (!count) continue;
    const tr = document.createElement("tr");
    const tdColor = document.createElement("td");
    tdColor.textContent = getColorLabel(key);
    const tdCount = document.createElement("td");
    tdCount.textContent = String(count);
    tr.appendChild(tdColor);
    tr.appendChild(tdCount);
    colorTable.appendChild(tr);
}

colorSection.appendChild(colorTable);
// 円グラフ（デッキ全体に対する割合）
if (options.showColorPie) {
    const colorItems = (["W","U","B","R","G","M","C"])
        .map((k) => ({ label: getColorLabel(k), value: (stats.colorCounts?.[k]) ?? 0 }))
        .filter((x) => x.value > 0);
    const pie = createPieChartElement(colorItems, stats.totalCards, { maxSlices: 8, size: 160, labelColorMap: { "白":"#F7F1C6", "青":"#4A90E2", "黒":"#4A4A4A", "赤":"#D64545", "緑":"#4CAF50", "多色":"#F2C94C", "無色":"#E0E0E0" }, otherColor: "#ccc" });
    pie.classList.add("magic-color-pie");
    colorSection.appendChild(pie);
}

if (options.showColorCounts || options.showColorPie) {
    body.appendChild(colorSection);
}
    // 表示対象が無い場合のメッセージ
    if (!options.showManaCurve && !options.showCardTypes && !options.showTypePie && !options.showColorCounts && !options.showColorPie) {
        const msg = document.createElement("div");
        msg.className = "magic-deck-stats-empty";
        msg.textContent = "表示項目がオフです（設定でONにできます）";
        body.appendChild(msg);
    }

    // ----- 合計 -----
    const summary = document.createElement("div");
    summary.className = "magic-deck-summary";
    summary.textContent = `Total cards: ${stats.totalCards}`;
    container.appendChild(summary);
}


/**
 * カード情報(JSON)を取得する関数
 * - 先に per-card JSON / 一括JSONを見て、なければ Scryfall を叩く
 * - 返り値は Scryfall の元 JSON (wrapper.original 相当)
 * @param {string} name
 * @returns {Promise<any|null>}
 */
async function fetchCardData(name) {
    if (!name || !name.trim()) return null;
    const key = name.trim();

    try {
        await ensureCacheDirs();

        // ① per-card の json キャッシュ
        let cachedJson = await readJsonCache(key);
        let cardData = cachedJson ? (cachedJson.original || cachedJson) : null;

        // ② なければ一括JSON(ja_only / oracle)から探す
        if (!cardData) {
            try {
                if (isJapaneseName(key)) {
                    const idx = await loadJaOnlyIndex();
                    const found = findCardInIndex(idx, key);
                    if (found) {
                        cardData = found;
                        // 見つかったら per-card キャッシュも作っておく
                        await writeJsonCache(key, { original: found });
                    }
                } else {
                    const idx = await loadOracleIndex();
                    const found = findCardInIndex(idx, key);
                    if (found) {
                        cardData = found;
                        await writeJsonCache(key, { original: found });
                    }
                }
            } catch (e) {
                console.warn(
                    "[MagicListPlugin] error while searching in bulk json for",
                    key,
                    e
                );
            }
        }

        // ③ ここまでで cardData が手に入っていれば、それを返す
        if (cardData) {
            return cardData;
        }
    } catch (e) {
        console.warn(
            "[MagicListPlugin] error while reading json/bulk cache in fetchCardData:",
            e
        );
    }

    // ④ それでも無ければ最後の手段として Scryfall API を叩く（ja → en）
    const langs = ["ja", "en"];
    for (const lang of langs) {
        const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(
            key
        )}&lang=${lang}`;

        try {
            const data = await fetchJsonWithRetry(url, {
                retries: 2,
                timeoutMs: 7000,
            });

            const wrapper = { original: data };
            await writeJsonCache(key, wrapper);

            return data;
        } catch (e) {
            console.warn(
                `[MagicListPlugin] failed to fetch card data "${key}" (lang=${lang})`,
                e
            );
        }
    }

    return null;
}



/**
 * カード名 → ファイル名（安全な文字列）へ変換
 */
function makeSafeFilename(name) {
    return encodeURIComponent(name.trim()).replace(/%/g, "_");
}

/**
 * Vault 内のキャッシュ用ディレクトリを作成
 */
async function ensureCacheDirs() {
    if (!appRef) return;
    const adapter = appRef.vault.adapter;

    if (!(await adapter.exists(CACHE_ROOT))) {
        await adapter.mkdir(CACHE_ROOT);
    }
    if (!(await adapter.exists(JSON_DIR))) {
        await adapter.mkdir(JSON_DIR);
    }
    if (!(await adapter.exists(IMG_DIR))) {
        await adapter.mkdir(IMG_DIR);
    }
}

/**
 * タイムアウト & リトライ付き fetch(JSON)
 */
async function fetchJsonWithRetry(url, options = {}) {
    const retries = options.retries ?? 2;
    const timeoutMs = options.timeoutMs ?? 7000;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);

            if (!res.ok) {
                lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
            } else {
                return await res.json();
            }
        } catch (e) {
            lastError = e;
        }

        if (attempt < retries) {
            const delay = 500 * (attempt + 1);
            console.warn(
                `[MagicListPlugin] fetch retry in ${delay}ms: ${url}`,
                lastError
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    console.error("[MagicListPlugin] fetch failed:", url, lastError);
    throw lastError;
}

/**
 * キャッシュJSON読み込み
 */
async function readJsonCache(cardName) {
    if (!appRef) return null;
    const adapter = appRef.vault.adapter;
    const safe = makeSafeFilename(cardName);
    const path = `${JSON_DIR}/${safe}.json`;

    if (!(await adapter.exists(path))) return null;

    try {
        const txt = await adapter.read(path);
        return JSON.parse(txt);
    } catch (e) {
        console.warn("[MagicListPlugin] failed to read json cache:", path, e);
        return null;
    }
}

/**
 * キャッシュJSON書き込み
 */
async function writeJsonCache(cardName, data) {
    if (!appRef) return;
    const adapter = appRef.vault.adapter;
    const safe = makeSafeFilename(cardName);
    const path = `${JSON_DIR}/${safe}.json`;

    try {
        await adapter.write(path, JSON.stringify(data));
    } catch (e) {
        console.warn("[MagicListPlugin] failed to write json cache:", path, e);
    }
}

/**
 * ローカル画像パス（存在チェック付き）を取得
 */
async function getLocalImagePath(cardName) {
    if (!appRef) return null;
    const adapter = appRef.vault.adapter;
    const safe = makeSafeFilename(cardName);
    const imgPath = `${IMG_DIR}/${safe}.jpg`;

    if (!(await adapter.exists(imgPath))) return null;

    // Vault 内ファイルをブラウザから参照するための URL を取得
    try {
        const resourcePath = adapter.getResourcePath(imgPath);
        return resourcePath;
    } catch (e) {
        console.warn(
            "[MagicListPlugin] failed to getResourcePath for",
            imgPath,
            e
        );
        return null;
    }
}

/**
 * 画像をダウンロードしてローカルにキャッシュ
 */
async function writeImageCache(cardName, imageUrl) {
    if (!appRef || !imageUrl) return null;

    const adapter = appRef.vault.adapter;
    const safe = makeSafeFilename(cardName);
    const imgPath = `${IMG_DIR}/${safe}.jpg`;

    try {
        // ★ CORS を回避するために fetch ではなく requestUrl を使う
        const res = await requestUrl({
            url: imageUrl,
            method: "GET",
            throw: false,
        });

        if (res.status < 200 || res.status >= 300) {
            throw new Error(`HTTP ${res.status} ${res.statusText || ""}`);
        }

        const buf = res.arrayBuffer; // ArrayBuffer

        if (typeof adapter.writeBinary === "function") {
            // Obsidian 1.4+ ならこれが使える
            await adapter.writeBinary(imgPath, buf);
        } else if (typeof adapter.writeRaw === "function") {
            // 一部環境向けフォールバック
            const uint8 = new Uint8Array(buf);
            await adapter.writeRaw(imgPath, uint8);
        } else {
            // 最悪のフォールバック（バイナリ保存非対応環境）
            console.warn(
                "[MagicListPlugin] adapter has no binary write method; skip image cache"
            );
            return null;
        }

        const resourcePath = adapter.getResourcePath(imgPath);
        return resourcePath;
    } catch (e) {
        console.error(
            "[MagicListPlugin] failed to cache image",
            cardName,
            imageUrl,
            e
        );
        return null;
    }
}



/**
 * Scryfall のレスポンスから画像URLを取り出す
 */
function extractImageUrl(data, requestedName) {
    if (data && data.image_uris && data.image_uris.normal) {
        return data.image_uris.normal;
    }

    if (data && Array.isArray(data.card_faces) && data.card_faces.length > 0) {
        const face = data.card_faces.find((f) => f.name === requestedName);
        if (face && face.image_uris && face.image_uris.normal) {
            return face.image_uris.normal;
        }
        const first = data.card_faces[0];
        if (first && first.image_uris && first.image_uris.normal) {
            return first.image_uris.normal;
        }
    }
    return null;
}

/**
 * カード画像URL（ローカル or リモート）を取得するメイン関数
 * - まずメモリキャッシュ
 * - つぎに Vault 内 json/img キャッシュ
 * - それでも無ければ Scryfall API へ
 * @param {string} name
 * @returns {Promise<string|null>} img.src に渡せる URL
 */
async function fetchCardImage(name) {
    if (!name || !name.trim()) return null;
    const key = name.trim();

    // メモリキャッシュ優先
    if (cardImageCache.has(key)) {
        return cardImageCache.get(key);
    }

    const promise = (async () => {
                try {
            await ensureCacheDirs();

            // 画像ファイルだけ先に存在する場合もあるのでチェック
            const localImg = await getLocalImagePath(key);
            if (localImg) {
                return localImg;
            }

            // ① まず per-card の json キャッシュ
            let cachedJson = await readJsonCache(key);
            let cardData = cachedJson ? (cachedJson.original || cachedJson) : null;

            // ② なければ一括JSON(ja_only / oracle)から探す
            if (!cardData) {
                try {
                    if (isJapaneseName(key)) {
                        const idx = await loadJaOnlyIndex();
                        const found = findCardInIndex(idx, key);
                        if (found) {
                            cardData = found;
                            // 見つかったら per-card キャッシュも作っておく
                            await writeJsonCache(key, { original: found });
                        }
                    } else {
                        const idx = await loadOracleIndex();
                        const found = findCardInIndex(idx, key);
                        if (found) {
                            cardData = found;
                            await writeJsonCache(key, { original: found });
                        }
                    }
                } catch (e) {
                    console.warn(
                        "[MagicListPlugin] error while searching in bulk json for",
                        key,
                        e
                    );
                }
            }

            // ③ cardData が手に入っていれば、そこから画像URLを取り出す
            if (cardData) {
                const imageUrlFromCache = extractImageUrl(cardData, key);
                if (imageUrlFromCache) {
                    const resPath = await writeImageCache(key, imageUrlFromCache);
                    return resPath || imageUrlFromCache;
                }
            }
        } catch (e) {
            console.warn("[MagicListPlugin] error while reading cache/bulk json:", e);
        }

        // 2. Scryfall API を叩く（ja → en の順で試す）
        const langs = ["ja", "en"];
        for (const lang of langs) {
            const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(
                key
            )}&lang=${lang}`;

            try {
                const data = await fetchJsonWithRetry(url, {
                    retries: 2,
                    timeoutMs: 7000,
                });

                // キャッシュ保存用にラップしておく
                const wrapper = { original: data };
                await writeJsonCache(key, wrapper);

                const imageUrl = extractImageUrl(data, key);
                if (imageUrl) {
                    const resPath = await writeImageCache(key, imageUrl);
                    return resPath || imageUrl;
                }
            } catch (e) {
                console.warn(
                    `[MagicListPlugin] failed to fetch card "${key}" (lang=${lang})`,
                    e
                );
            }
        }

        // 全部ダメだった
        return null;
    })();

    cardImageCache.set(key, promise);
    return promise;
}

// ==============================
// プラグイン本体
// ==============================
module.exports = class MagicListPlugin extends Plugin {
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async onload() {
        appRef = this.app;
        const plugin = this;
        console.log("MagicListPlugin loaded (with local Scryfall cache)");

        await this.loadSettings();
        applyCacheDirSettings(this.settings);
        this.addSettingTab(new MagicListSettingTab(this.app, this));

        await ensureCacheDirs();

        // ------------------------------
        // mtg-list: デッキリスト表示
        // ------------------------------
        this.registerMarkdownCodeBlockProcessor(
            "mtg-list",
            (source, el, ctx) => {
                const lines = source.trim().split("\n");

                let currentSection = "List";
                let currentCards = [];
                const sections = [];

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line) continue;

                    const sectionHeaderMatch = line.match(/^(.+?)[：:]$/);
                    if (sectionHeaderMatch) {
                        if (currentCards.length > 0) {
                            sections.push({
                                title: currentSection,
                                cards: currentCards,
                            });
                        }
                        currentSection = sectionHeaderMatch[1];
                        currentCards = [];
                        continue;
                    }

                    const match = line.match(/^(\d+)\s+(.+)$/);
                    if (match) {
                        currentCards.push({
                            count: parseInt(match[1], 10),
                            name: match[2],
                        });
                    }
                }

                if (currentCards.length > 0) {
                    sections.push({
                        title: currentSection,
                        cards: currentCards,
                    });
                }

                if (sections.length === 0) {
                    const msg = document.createElement("div");
                    msg.textContent = "カードリストが空です。";
                    msg.style.color = "var(--text-muted)";
                    el.appendChild(msg);
                    return;
                }

                // ===== コンテナ構造 =====
                const root = document.createElement("div");
                root.className = "magic-card-root";
                el.appendChild(root);

                // 上部: デッキスタッツ
                const statsDiv = document.createElement("div");
                statsDiv.className = "magic-deck-stats";
                statsDiv.textContent = "Deck Stats: 読み込み中...";
                root.appendChild(statsDiv);

                // 下部: カードリスト
                const container = document.createElement("div");
                container.className = "magic-card-container";
                root.appendChild(container);

                // ここに「後から処理するためのエントリ」を溜めておく
                const entries = [];

                // ===== 各セクションの枠とプレースホルダだけ先に描画 =====
                for (const section of sections) {
                    const totalCount = section.cards.reduce(
                        (sum, card) => sum + card.count,
                        0
                    );

                    const sectionHeader = document.createElement("h3");
                    sectionHeader.textContent = `${section.title} : ${totalCount}`;
                    container.appendChild(sectionHeader);

                    const grid = document.createElement("div");
                    grid.className = "magic-card-grid";
                    container.appendChild(grid);

                    for (const { count, name } of section.cards) {
                        const item = document.createElement("div");
                        item.className = "magic-card-item";

                        const badge = document.createElement("div");
                        badge.className = "magic-card-count";
                        badge.textContent = `${count}x`;
                        item.appendChild(badge);

                        const placeholder = document.createElement("div");
                        placeholder.className = "magic-card-placeholder";
                        placeholder.textContent = `読み込み中: ${name}`;
                        item.appendChild(placeholder);

                        grid.appendChild(item);

                        entries.push({
                            name,
                            count,
                            itemEl: item,
                            placeholderEl: placeholder,
                        });
                    }
                }

                // ===== 実際のカード処理は並列で後から実行 =====
                // エラーはコンソールに出すだけにして、描画は崩さない
                processDeckEntries(entries, statsDiv, plugin).catch((e) => {
                    console.error("[MagicListPlugin] processDeckEntries error", e);
                    statsDiv.textContent = "Deck Stats: 読み込み中にエラーが発生しました";
                });
            }
        );



        // ------------------------------
        // mtg-card: 単体/複数カード表示
        // ------------------------------
        this.registerMarkdownCodeBlockProcessor(
            "mtg-card",
            async (source, el, ctx) => {
                const cardNames = source
                    .trim()
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);

                el.empty();

                if (cardNames.length === 0) {
                    const msg = document.createElement("div");
                    msg.textContent = "カード名が指定されていません。";
                    msg.style.color = "var(--text-muted)";
                    el.appendChild(msg);
                    return;
                }

                const container = document.createElement("div");
                container.style.display = "flex";
                container.style.gap = "10px";
                container.style.flexWrap = "wrap";
                container.style.justifyContent = "flex-start";
                container.style.alignItems = "flex-start";
                container.style.alignContent = "flex-start";
                el.appendChild(container);

                for (const cardName of cardNames) {
                    let imageUrl = null;
                    try {
                        imageUrl = await fetchCardImage(cardName);
                    } catch (e) {
                        console.error(
                            "[MagicListPlugin] error while fetching card image (mtg-card)",
                            cardName,
                            e
                        );
                    }

                    if (!imageUrl) {
                        const errorMsg = document.createElement("div");
                        errorMsg.textContent = `カード画像が取得できませんでした: ${cardName}`;
                        errorMsg.style.color = "red";
                        errorMsg.style.fontSize = "0.9em";
                        errorMsg.style.border =
                            "1px solid var(--background-modifier-border)";
                        errorMsg.style.borderRadius = "4px";
                        errorMsg.style.padding = "4px";
                        errorMsg.style.backgroundColor =
                            "var(--background-modifier-error)";
                        container.appendChild(errorMsg);
                        continue;
                    }
                    const img = document.createElement("img");
                    img.src = imageUrl;
                    img.alt = cardName;
                    img.style.width = "200px";
                    img.style.height = "auto";
                    img.style.border = "1px solid #ccc";
                    img.style.borderRadius = "4px";
                    img.style.margin = "0";

                    // ★ クリックで拡大
                    img.style.cursor = "zoom-in";
                    img.addEventListener("click", () => {
                        new ImageZoomModal(plugin.app, imageUrl, cardName).open();
                    });

                    container.appendChild(img);

                }
            }
        );
    }

    onunload() {
        console.log("MagicListPlugin unloaded");
        cardImageCache.clear();
    }
};
