/**
 * @name MultiGamePlaytime
 * @author uwemanfred64-png
 * @description Lets Discord see several games from its own game list running at the same time, so your playtime and the number of games you played grow for the Game Time and Game Variety badges. Rotates through your lists, lets you edit the minutes of every game, adds games from your friends' profiles, pauses while you really play, follows a schedule, shows game icons and statistics, tells you about updates, comes in 30 languages and never asks for your account token. No library needed.
 * @version 1.4.2
 * @source https://github.com/uwemanfred64-png/MultiGamePlaytime
 * @website https://github.com/uwemanfred64-png/MultiGamePlaytime
 * @updateUrl https://raw.githubusercontent.com/uwemanfred64-png/MultiGamePlaytime/main/MultiGamePlaytime.plugin.js
 */

const GAMES_URL = "https://cdn.discordapp.com/detectables/games-v1.json";
const GAMES_FALLBACK_URL = "https://discord.com/api/v9/applications/detectable";
const APP_URL = "https://discord.com/api/v9/applications/{id}/rpc";
const ICON_URL = "https://cdn.discordapp.com/app-icons/{id}/{icon}.png?size=64";
const MINUTE = 60000;
const MAX_TICK = 5 * MINUTE;
const AT_ONCE = [0, 1, 5, 10, 25, 50];
const MAX_AT_ONCE = 50;
const ROTATE = [0, 10, 30, 60];
const SEARCH_RESULTS = 20;
const RANDOM_BATCH = 25;
const PID_MIN = 20000;
const PID_RANGE = 40000;
const PLAYED_SECONDS = 60;
const MAX_MINUTES = 9999999;
const HEARTBEAT = "running_game_heartbeat";
const GTA_V_ID = "1402418714716143646";
const EXTRA_GAMES = [{ id: GTA_V_ID, name: "FiveM", exe: "grand theft auto v/fivem.exe", detected: true }];
const SHORTCUTS = { gta: ["grand", "theft", "auto"], rdr: ["red", "dead", "redemption"], cs: ["counter", "strike"], cod: ["call", "of", "duty"], lol: ["league", "of", "legends"] };
const ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
const MAIN_LIST = "main";
const LIST_NAME_LENGTH = 32;
const SHARE_PREFIX = "MGP1:";
const ICON_DELAY = 250;
const PLAYING = 0;
const UPDATE_URL = "https://raw.githubusercontent.com/uwemanfred64-png/MultiGamePlaytime/main/MultiGamePlaytime.plugin.js";
const UPDATE_DELAY = 10000;
const UPDATE_INTERVAL = 6 * 60 * MINUTE;
const FILE_NAME = "MultiGamePlaytime.plugin.js";
const CHANGELOG = [
    { title: "Changed", type: "improved", items: ["Cleaned up the code, nothing changes for you"] },
    { title: "New in 1.4", type: "added", items: ["This window shows up after every update", "Notice with an Update button when a new version is out, can be turned off in the settings"] },
];

const defaults = { language: "auto", active: false, showPlaying: true, atOnce: 0, rotate: 0, pauseOnReal: true, featured: "", scheduleFrom: -1, scheduleTo: -1, panelButton: true, checkUpdates: true, list: MAIN_LIST };

function format(text, values) {
    return text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

function duration(seconds, t) {
    const minutes = Math.floor(seconds / 60);
    return format(t.duration, { h: Math.floor(minutes / 60).toLocaleString(), m: minutes % 60 });
}

function hourLabel(hour) {
    return `${String(hour).padStart(2, "0")}:00`;
}

function toGame(entry) {
    if (!entry?.id || !entry.name) return null;
    const exe = (entry.executables ?? []).find(e => e.os === "win32" && !e.is_launcher)?.name;
    const fallback = `${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || entry.id}.exe`;
    return { id: String(entry.id), name: entry.name, exe: (exe ?? fallback).replace(/^>/, ""), detected: !!exe };
}

function searchWords(query) {
    return query.toLowerCase().split(/[\s:\-]+/).filter(Boolean).flatMap(w => SHORTCUTS[w] ?? [w]);
}

function matchesWord(name, tokens, word) {
    if (name.includes(word)) return true;
    const number = Number(word);
    return Number.isInteger(number) && number > 0 && number < ROMAN.length && tokens.includes(ROMAN[number]);
}

function isNewer(remote, local) {
    const a = String(remote).split(".").map(Number);
    const b = String(local).split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
}

function encodeShare(games) {
    const json = JSON.stringify(games.map(g => [g.id, g.name, g.exe]));
    return SHARE_PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

function decodeShare(text) {
    const code = String(text ?? "").trim();
    if (!code.startsWith(SHARE_PREFIX)) return null;
    try {
        const bytes = Uint8Array.from(atob(code.slice(SHARE_PREFIX.length)), c => c.charCodeAt(0));
        const list = JSON.parse(new TextDecoder().decode(bytes));
        if (!Array.isArray(list)) return null;
        const games = list
            .filter(e => Array.isArray(e) && /^\d{5,25}$/.test(String(e[0])) && typeof e[1] === "string" && e[1].trim() && typeof e[2] === "string" && e[2].trim())
            .map(([id, name, exe]) => ({ id: String(id), name: name.trim().slice(0, 200), exe: exe.trim().slice(0, 200) }));
        return games.length ? games : null;
    } catch {
        return null;
    }
}

function gamepadIcon(size) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    for (const [key, value] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    for (const d of ["M6 11h4", "M8 9v4", "M15 12h.01", "M18 10h.01", "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"]) {
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", d);
        svg.append(path);
    }
    return svg;
}

module.exports = class MultiGamePlaytime {
    constructor(meta) {
        this.api = new BdApi(meta.name);
        this.version = meta.version;
        this.fileName = meta.filename ?? FILE_NAME;
        this.fakes = [];
        this.onTick = this.onTick.bind(this);
        this.onRunningGames = this.onRunningGames.bind(this);
        this.icons = {};
        this.iconQueue = [];
    }

    get t() {
        const chosen = this.settings?.language;
        const locale = (chosen && chosen !== "auto" ? chosen : this.stores?.Locale?.locale ?? document.documentElement.lang ?? "en").toLowerCase();
        const exact = Object.keys(labels).find(key => key.toLowerCase() === locale);
        const base = exact ?? (locale.split("-")[0] in labels ? locale.split("-")[0] : "en");
        return { ...labels.en, ...labels[base] };
    }

    start() {
        const { Webpack, Data, DOM, Patcher, ContextMenu } = this.api;
        this.stores = {
            RunningGame: Webpack.getStore("RunningGameStore"),
            Presence: Webpack.getStore("PresenceStore"),
            Locale: Webpack.getStore("LocaleStore"),
        };
        this.dispatcher = Webpack.getByKeys("dispatch", "subscribe", "register", { searchExports: true });
        this.analytics = Webpack.getByKeys("track", "setSystemAccessibilityFeatures", "expandEventProperties");
        if (!this.stores.RunningGame?.getRunningGames || !this.dispatcher) {
            this.api.UI.showToast(`${this.api.name ?? "MultiGamePlaytime"}: Discord's game detection was not found. It only exists in the desktop app.`, { type: "error" });
            this.stores = null;
            return;
        }

        const saved = Data.load("settings") ?? {};
        this.settings = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, saved[key] ?? value]));
        const lists = Data.load("lists");
        const legacy = Data.load("games");
        this.hadData = !!(lists || legacy);
        this.lists = lists && typeof lists === "object" && !Array.isArray(lists) ? lists : { [MAIN_LIST]: Array.isArray(legacy) ? legacy : [] };
        if (!Array.isArray(this.lists[MAIN_LIST])) this.lists[MAIN_LIST] = [];
        if (!Array.isArray(this.lists[this.settings.list])) this.settings.list = MAIN_LIST;
        this.save("lists", this.lists);
        this.stats = { seconds: {}, ...Data.load("stats") };
        this.rotation = Number(Data.load("rotation")) || 0;
        this.icons = { ...Data.load("icons") };
        this.nextPid = PID_MIN + Math.floor(Math.random() * PID_RANGE);

        const store = this.stores.RunningGame;
        const merge = ret => {
            if (!this.fakes.length) return ret;
            const real = Array.isArray(ret) ? ret : [];
            return [...real, ...this.fakes.filter(f => !real.some(r => r.id === f.id))];
        };
        Patcher.after(store, "getRunningGames", (_, args, ret) => merge(ret));
        if (store.getVisibleRunningGames) Patcher.after(store, "getVisibleRunningGames", (_, args, ret) => (this.settings?.showPlaying ? merge(ret) : ret));
        if (store.getVisibleGame) Patcher.after(store, "getVisibleGame", (_, args, ret) => ret ?? (this.settings?.showPlaying ? this.shownFake() : null));
        if (store.getGameForPID) Patcher.after(store, "getGameForPID", (_, [pid], ret) => ret ?? this.fakes.find(f => f.pid === pid) ?? null);

        this.unpatchMenu = ContextMenu.patch?.("user-context", (tree, props) => this.extendUserMenu(tree, props));
        this.dispatcher.subscribe("RUNNING_GAMES_CHANGE", this.onRunningGames);

        DOM.addStyle("main", this.css());
        this.tickTimer = setInterval(this.onTick, MINUTE);
        this.lastTick = Date.now();
        this.sync();
        this.observer();
        this.showChangelog();
        this.updateDelay = setTimeout(() => this.checkForUpdate(), UPDATE_DELAY);
        this.updateTimer = setInterval(() => this.checkForUpdate(), UPDATE_INTERVAL);
    }

    stop() {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
        clearTimeout(this.iconTimer);
        this.iconTimer = null;
        clearTimeout(this.updateDelay);
        clearInterval(this.updateTimer);
        this.updateTimer = null;
        this.closeNotice?.();
        this.closeNotice = null;
        this.iconQueue = [];
        if (this.stores) {
            this.countTime();
            this.setFakes([]);
            this.dispatcher.unsubscribe("RUNNING_GAMES_CHANGE", this.onRunningGames);
        }
        this.unpatchMenu?.();
        this.unpatchMenu = null;
        this.panelButton?.remove();
        this.panelButton = null;
        this.panelTooltip = null;
        this.api.Patcher.unpatchAll();
        this.api.DOM.removeStyle("main");
        this.stores = null;
        this.settings = null;
    }

    observer() {
        if (!this.settings) return;
        if (!this.settings.panelButton) {
            this.panelButton?.remove();
            this.panelButton = null;
            return;
        }
        if (this.panelButton?.isConnected) return;
        const row = [...document.querySelectorAll('section[class*="panels_"] [class*="buttons_"]')].find(el => el.querySelector('button[role="switch"]'));
        if (!row) return;
        const template = [...row.querySelectorAll("button")].at(-1);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `${template?.className ?? ""} mgp-panel`.trim();
        button.append(gamepadIcon(20));
        button.addEventListener("click", () => this.toggleActive());
        this.panelTooltip = this.api.UI.createTooltip?.(button, "MultiGamePlaytime", { side: "top" }) ?? null;
        row.prepend(button);
        this.panelButton = button;
        this.updatePanelButton();
    }

    updatePanelButton() {
        const button = this.panelButton;
        if (!button || !this.settings) return;
        const label = this.statusText();
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(!!this.settings.active));
        button.classList.toggle("mgp-panel-on", this.fakes.length > 0);
        button.classList.toggle("mgp-panel-paused", this.settings.active && !this.fakes.length);
        if (this.panelTooltip?.labelElement) this.panelTooltip.labelElement.textContent = label;
    }

    statusText() {
        const t = this.t;
        if (!this.settings?.active) return t.status_off;
        if (this.fakes.length) return format(t.status_running, { n: this.fakes.length });
        const real = this.realGames();
        if (this.settings.pauseOnReal && real.length) return format(t.status_pausedReal, { game: real[0].name ?? "?" });
        if (!this.inSchedule()) return format(t.status_pausedSchedule, { time: hourLabel(Number(this.settings.scheduleFrom)) });
        return t.toast_empty;
    }

    toggleActive() {
        if (!this.settings) return;
        this.settings.active = !this.settings.active;
        this.save("settings", this.settings);
        if (this.settings.active) this.begin();
        else this.end();
    }

    showChangelog() {
        const { Data, UI } = this.api;
        const last = Data.load("version");
        const known = last ?? (this.hadData ? "0" : null);
        if (this.version) Data.save("version", this.version);
        if (!known || !this.version || !isNewer(this.version, known)) return;
        UI.showChangelogModal?.({ title: "MultiGamePlaytime", subtitle: `Version ${this.version}`, changes: CHANGELOG });
    }

    async checkForUpdate() {
        if (!this.settings?.checkUpdates || this.closeNotice || !this.api.Net?.fetch) return;
        try {
            const response = await this.api.Net.fetch(UPDATE_URL);
            if (!response.ok) return;
            const code = await response.text();
            const remote = /@version\s+([\d.]+)/.exec(code)?.[1];
            if (!this.settings || !remote || !isNewer(remote, this.version) || !code.includes("@name MultiGamePlaytime")) return;
            const t = this.t;
            this.closeNotice = this.api.UI.showNotice(format(t.notice_update, { version: remote }), {
                type: "info",
                buttons: [{ label: t.button_update, onClick: close => {
                    close?.();
                    this.closeNotice = null;
                    this.installUpdate(code, remote);
                } }],
            });
        } catch (err) {
            console.error("[MultiGamePlaytime]", err);
        }
    }

    installUpdate(code, version) {
        const t = this.t;
        try {
            const fs = require("fs");
            const path = require("path");
            fs.writeFileSync(path.join(this.api.Plugins.folder, this.fileName), code);
            this.api.UI.showToast(format(t.toast_updated, { version }), { type: "success" });
        } catch (err) {
            this.api.UI.showToast(format(t.toast_updateFailed, { error: err?.message ?? String(err) }), { type: "error" });
        }
    }

    save(key, value) {
        this.api.Data.save(key, value);
    }

    get games() {
        return this.lists?.[this.settings?.list] ?? [];
    }

    set games(value) {
        this.lists[this.settings.list] = value;
        this.save("lists", this.lists);
    }

    realGames() {
        const pids = new Set(this.fakes.map(f => f.pid));
        const all = this.stores?.RunningGame?.getRunningGames?.() ?? [];
        return (Array.isArray(all) ? all : []).filter(g => g && !pids.has(g.pid) && !g.isLauncher);
    }

    inSchedule() {
        const from = Number(this.settings?.scheduleFrom);
        const to = Number(this.settings?.scheduleTo);
        if (!(from >= 0) || !(to >= 0) || from === to) return true;
        const hour = new Date().getHours();
        return from < to ? hour >= from && hour < to : hour >= from || hour < to;
    }

    shouldRun() {
        return !!this.settings?.active && this.inSchedule() && !(this.settings.pauseOnReal && this.realGames().length);
    }

    shownFake() {
        return this.fakes.find(f => f.id === this.settings?.featured) ?? this.fakes[0] ?? null;
    }

    batchSize() {
        const wanted = Number(this.settings.atOnce) || MAX_AT_ONCE;
        return Math.min(wanted, MAX_AT_ONCE, this.games.length);
    }

    nextBatch() {
        const games = this.games;
        const size = this.batchSize();
        if (!size) return [];
        const featured = games.find(g => g.id === this.settings.featured);
        const others = featured ? games.filter(g => g !== featured) : games;
        const room = featured ? size - 1 : size;
        let picked;
        if (!(Number(this.settings.rotate) > 0) || room >= others.length) picked = others.slice(0, room);
        else {
            const start = this.rotation % others.length;
            picked = Array.from({ length: room }, (_, i) => others[(start + i) % others.length]);
        }
        return featured ? [featured, ...picked] : picked;
    }

    makeFake(game, previous) {
        const kept = previous?.find(f => f.id === game.id);
        if (kept) return kept;
        const pid = this.nextPid++;
        const exeName = game.exe.split("/").pop();
        return {
            id: game.id,
            name: game.name,
            exeName,
            exePath: `c:/program files/${game.name.toLowerCase()}/${game.exe}`,
            cmdLine: `C:\\Program Files\\${game.name}\\${game.exe.replace(/\//g, "\\")}`,
            processName: game.name,
            pid,
            pidPath: [pid],
            hidden: false,
            isLauncher: false,
            start: Date.now() - (this.stats.seconds[game.id] || 0) * 1000,
        };
    }

    setFakes(next) {
        const previous = this.fakes;
        const removed = previous.filter(f => !next.includes(f));
        const added = next.filter(f => !previous.includes(f));
        this.fakes = next;
        if (!removed.length && !added.length) return;
        this.dispatching = true;
        try {
            this.dispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed, added, games: this.stores.RunningGame.getRunningGames() ?? [] });
        } catch (err) {
            console.error("[MultiGamePlaytime]", err);
        } finally {
            this.dispatching = false;
        }
        this.updatePanelButton();
    }

    sync() {
        if (!this.settings) return;
        this.countTime();
        if (!this.shouldRun()) {
            this.setFakes([]);
            this.updatePanelButton();
            return;
        }
        const batch = this.nextBatch();
        this.setFakes(batch.map(game => this.makeFake(game, this.fakes)));
        this.updatePanelButton();
    }

    begin(quiet = false) {
        if (!this.settings) return;
        const t = this.t;
        this.batchStarted = Date.now();
        this.sync();
        if (quiet) return;
        if (!this.games.length) this.api.UI.showToast(t.toast_empty, { type: "info" });
        else if (this.fakes.length) this.api.UI.showToast(format(t.toast_started, { n: this.fakes.length }), { type: "success" });
        else this.api.UI.showToast(this.statusText(), { type: "info" });
    }

    end() {
        if (!this.settings) return;
        this.countTime();
        const running = this.fakes.length;
        this.setFakes([]);
        this.updatePanelButton();
        if (running) this.api.UI.showToast(this.t.toast_stopped, { type: "info" });
    }

    refreshBatch() {
        if (this.settings) this.sync();
    }

    onRunningGames() {
        if (this.dispatching || !this.settings) return;
        const running = this.fakes.length > 0;
        if (running !== this.shouldRun()) this.sync();
    }

    countTime() {
        const now = Date.now();
        if (!this.settings || !this.fakes.length || !this.lastTick) {
            this.lastTick = now;
            return;
        }
        const seconds = Math.round(Math.min(now - this.lastTick, MAX_TICK) / 1000);
        this.lastTick = now;
        if (seconds <= 0) return;
        for (const fake of this.fakes) this.stats.seconds[fake.id] = (this.stats.seconds[fake.id] || 0) + seconds;
        this.save("stats", this.stats);
    }

    onTick() {
        if (!this.settings) return;
        this.countTime();
        const minutes = Number(this.settings.rotate);
        const hasFeatured = this.games.some(g => g.id === this.settings.featured);
        const others = this.games.length - (hasFeatured ? 1 : 0);
        const room = this.batchSize() - (hasFeatured ? 1 : 0);
        if (this.fakes.length && minutes > 0 && room > 0 && others > room && Date.now() - (this.batchStarted ?? 0) >= minutes * MINUTE) {
            this.rotation = (this.rotation + room) % others;
            this.save("rotation", this.rotation);
            this.batchStarted = Date.now();
        }
        this.sync();
    }

    async loadDatabase() {
        if (this.database) return this.database;
        if (this.databaseLoading) return this.databaseLoading;
        this.databaseLoading = (async () => {
            for (const url of [GAMES_URL, GAMES_FALLBACK_URL]) {
                try {
                    const response = await this.api.Net.fetch(url);
                    if (!response.ok) continue;
                    const list = await response.json();
                    const games = (Array.isArray(list) ? list : []).map(toGame).filter(Boolean);
                    if (games.length) games.unshift(...EXTRA_GAMES.filter(extra => games.some(g => g.id === extra.id)));
                    if (games.length) {
                        this.database = games;
                        return games;
                    }
                } catch (err) {
                    console.error("[MultiGamePlaytime]", url, err);
                }
            }
            throw new Error(this.t.database_failed);
        })();
        try {
            return await this.databaseLoading;
        } finally {
            this.databaseLoading = null;
        }
    }

    search(query) {
        const words = searchWords(query);
        if (!words.length || !this.database) return [];
        const owned = new Set(this.games.map(g => g.id));
        const hits = [];
        for (const game of this.database) {
            if (owned.has(game.id)) continue;
            const name = game.name.toLowerCase();
            const tokens = name.split(/[^a-z0-9]+/);
            if (words.every(w => matchesWord(name, tokens, w))) hits.push(game);
        }
        const q = words.join(" ");
        const rank = game => (game.name.toLowerCase() === q ? 0 : game.name.toLowerCase().startsWith(q) ? 1 : 2) + (game.detected ? 0 : 3);
        return hits.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length).slice(0, SEARCH_RESULTS);
    }

    randomGames(count) {
        const owned = new Set(this.games.map(g => g.id));
        const pool = (this.database ?? []).filter(g => g.detected && !owned.has(g.id));
        const picked = [];
        while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        return picked;
    }

    addGames(list) {
        const owned = new Set(this.games.map(g => g.id));
        const fresh = [];
        for (const g of list) {
            if (!g || owned.has(g.id)) continue;
            owned.add(g.id);
            fresh.push({ id: g.id, name: g.name, exe: g.exe });
        }
        if (!fresh.length) return 0;
        this.games = [...this.games, ...fresh];
        this.refreshBatch();
        return fresh.length;
    }

    removeGame(id) {
        this.games = id == null ? [] : this.games.filter(g => g.id !== id);
        if (id == null || id === this.settings.featured) this.setFeatured("");
        if (this.rotation >= this.games.length) this.rotation = 0;
        this.refreshBatch();
    }

    setFeatured(id) {
        this.settings.featured = this.settings.featured === id ? "" : id;
        this.save("settings", this.settings);
        const running = this.fakes;
        if (running.length) {
            this.setFakes([]);
            this.setFakes(running);
        }
        this.refreshBatch();
    }

    switchList(name) {
        if (!Array.isArray(this.lists[name]) || name === this.settings.list) return;
        this.countTime();
        this.settings.list = name;
        this.settings.featured = "";
        this.rotation = 0;
        this.save("settings", this.settings);
        this.save("rotation", 0);
        this.refreshBatch();
    }

    createList(name) {
        const clean = String(name ?? "").trim().slice(0, LIST_NAME_LENGTH);
        if (!clean || clean in this.lists) return false;
        this.lists[clean] = [];
        this.save("lists", this.lists);
        this.switchList(clean);
        return true;
    }

    deleteList(name) {
        if (name === MAIN_LIST || !(name in this.lists)) return;
        delete this.lists[name];
        this.save("lists", this.lists);
        if (this.settings.list === name) {
            this.settings.list = MAIN_LIST;
            this.settings.featured = "";
            this.save("settings", this.settings);
            this.refreshBatch();
        }
    }

    listName(name) {
        return name === MAIN_LIST ? this.t.list_main : name;
    }

    async copyList() {
        const t = this.t;
        if (!this.games.length) return this.api.UI.showToast(t.toast_listEmpty, { type: "info" });
        const code = encodeShare(this.games);
        try {
            if (globalThis.DiscordNative?.clipboard?.copy) DiscordNative.clipboard.copy(code);
            else await navigator.clipboard.writeText(code);
            this.api.UI.showToast(format(t.toast_copied, { n: this.games.length }), { type: "success" });
        } catch {
            this.api.UI.showToast(t.toast_copyFailed, { type: "error" });
        }
        return code;
    }

    importList(text) {
        const t = this.t;
        const games = decodeShare(text);
        if (!games) {
            this.api.UI.showToast(t.toast_importInvalid, { type: "error" });
            return 0;
        }
        const added = this.addGames(games);
        this.api.UI.showToast(format(t.toast_imported, { n: added }), { type: added ? "success" : "info" });
        return added;
    }

    extendUserMenu(tree, props) {
        const user = props?.user;
        if (!user?.id || !this.settings || !tree?.props) return;
        const activities = (this.stores.Presence?.getActivities?.(user.id) ?? []).filter(a => a?.type === PLAYING && a.application_id && a.name);
        if (!activities.length) return;
        const owned = new Set(this.games.map(g => g.id));
        const group = this.api.ContextMenu.buildItem({
            type: "group",
            items: activities.map(a => ({
                id: `mgp-add-${a.application_id}`,
                label: format(owned.has(String(a.application_id)) ? this.t.context_owned : this.t.context_add, { game: a.name }),
                disabled: owned.has(String(a.application_id)),
                action: () => this.addFromActivity(a),
            })),
        });
        tree.props.children = [tree.props.children, group].flat();
    }

    async addFromActivity(activity) {
        const t = this.t;
        const id = String(activity.application_id);
        let game = null;
        try {
            game = (await this.loadDatabase()).find(g => g.id === id && g.name !== "FiveM") ?? null;
        } catch {
            game = null;
        }
        game ??= { id, name: activity.name, exe: `${activity.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || id}.exe` };
        const added = this.addGames([game]);
        this.api.UI.showToast(format(added ? t.toast_added : t.toast_alreadyAdded, { game: game.name }), { type: added ? "success" : "info" });
    }

    iconUrl(id) {
        const icon = this.icons[id];
        if (icon === undefined) this.queueIcon(id);
        return icon ? format(ICON_URL, { id, icon }) : null;
    }

    queueIcon(id) {
        if (this.iconQueue.includes(id) || !this.api.Net?.fetch) return;
        this.iconQueue.push(id);
        if (!this.iconTimer) this.iconTimer = setTimeout(() => this.loadIcons(), 0);
    }

    async loadIcons() {
        while (this.iconQueue.length && this.settings) {
            const id = this.iconQueue.shift();
            try {
                const response = await this.api.Net.fetch(format(APP_URL, { id }));
                const data = response.ok ? await response.json() : null;
                this.icons[id] = typeof data?.icon === "string" ? data.icon : "";
            } catch {
                this.icons[id] = "";
            }
            this.save("icons", this.icons);
            this.iconListener?.();
            await new Promise(resolve => setTimeout(resolve, ICON_DELAY));
        }
        this.iconTimer = null;
    }

    isRunning(id) {
        return this.fakes.some(f => f.id === id);
    }

    totals() {
        const values = Object.values(this.stats.seconds);
        return { seconds: values.reduce((a, b) => a + b, 0), played: values.filter(s => s >= PLAYED_SECONDS).length };
    }

    minutes(id) {
        return Math.floor((this.stats.seconds[id] || 0) / 60);
    }

    setMinutes(id, value, quiet = false) {
        const t = this.t;
        const game = this.games.find(g => g.id === id);
        const wanted = Math.floor(Number(value));
        if (!game || !Number.isFinite(wanted) || wanted < 0) return 0;
        const minutes = Math.min(wanted, MAX_MINUTES);
        const added = minutes - this.minutes(id);
        if (!added) return 0;

        if (added > 0 && !this.reportMinutes(game, added)) {
            if (!quiet) this.api.UI.showToast(t.toast_reportFailed, { type: "error" });
            return null;
        }
        this.countTime();
        this.stats.seconds[id] = minutes * 60;
        this.save("stats", this.stats);
        const running = this.fakes.find(f => f.id === id);
        if (running) this.setFakes(this.fakes.map(f => (f === running ? { ...f, start: Date.now() - minutes * MINUTE } : f)));
        if (!quiet) {
            if (added > 0) this.api.UI.showToast(format(t.toast_reported, { n: added.toLocaleString(), game: game.name }), { type: "success" });
            else this.api.UI.showToast(t.toast_lowered, { type: "info" });
        }
        return added;
    }

    addMinutesToAll(value) {
        const t = this.t;
        const add = Math.floor(Number(value));
        if (!Number.isFinite(add) || add <= 0 || !this.games.length) return 0;
        let count = 0;
        for (const game of this.games) {
            const result = this.setMinutes(game.id, this.minutes(game.id) + add, true);
            if (result === null) {
                this.api.UI.showToast(t.toast_reportFailed, { type: "error" });
                return count;
            }
            if (result > 0) count++;
        }
        this.api.UI.showToast(format(t.toast_reportedAll, { n: add.toLocaleString(), count }), { type: "success" });
        return count;
    }

    reportMinutes(game, minutes) {
        if (typeof this.analytics?.track !== "function") return false;
        const session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const base = { game_id: game.id, game_name: game.name, game_executable: game.exe.split("/").pop(), game_session_id: session };
        try {
            this.analytics.track(HEARTBEAT, { ...base, initial_heartbeat: true, final_heartbeat: false, duration_tracked_ms: 0 });
            this.analytics.track(HEARTBEAT, { ...base, initial_heartbeat: false, final_heartbeat: true, duration_tracked_ms: minutes * MINUTE });
            return true;
        } catch (err) {
            console.error("[MultiGamePlaytime]", err);
            return false;
        }
    }

    resetStats() {
        this.stats = { seconds: {} };
        this.save("stats", this.stats);
    }

    getSettingsPanel() {
        if (!this.settings) return Object.assign(document.createElement("div"), { textContent: "MultiGamePlaytime is not running. It needs the Discord desktop app." });

        const t = this.t;
        const { React, UI } = this.api;
        const { settings } = this;
        const hours = [{ label: t.hours_any, value: -1 }, ...Array.from({ length: 24 }, (_, h) => ({ label: hourLabel(h), value: h }))];

        return UI.buildSettingsPanel({
            settings: [
                { type: "switch", id: "active", name: t.set_active, note: t.note_active, value: settings.active },
                { type: "switch", id: "showPlaying", name: t.set_showPlaying, note: t.note_showPlaying, value: settings.showPlaying },
                { type: "switch", id: "pauseOnReal", name: t.set_pauseOnReal, note: t.note_pauseOnReal, value: settings.pauseOnReal },
                { type: "switch", id: "panelButton", name: t.set_panelButton, note: t.note_panelButton, value: settings.panelButton },
                { type: "switch", id: "checkUpdates", name: t.set_checkUpdates, note: t.note_checkUpdates, value: settings.checkUpdates },
                { type: "dropdown", id: "atOnce", name: t.set_atOnce, value: settings.atOnce, options: AT_ONCE.map(value => ({ label: value ? String(value) : format(t.atOnce_all, { n: MAX_AT_ONCE }), value })) },
                { type: "dropdown", id: "rotate", name: t.set_rotate, note: t.note_rotate, value: settings.rotate, options: ROTATE.map(value => ({ label: value ? format(t.rotate_minutes, { n: value }) : t.rotate_off, value })) },
                { type: "dropdown", id: "scheduleFrom", name: t.set_scheduleFrom, note: t.note_schedule, value: settings.scheduleFrom, options: hours },
                { type: "dropdown", id: "scheduleTo", name: t.set_scheduleTo, value: settings.scheduleTo, options: hours },
                { type: "dropdown", id: "language", name: t.set_language, value: settings.language, options: [{ label: t.language_auto, value: "auto" }, ...Object.entries(languageNames).map(([value, label]) => ({ label, value }))] },
                { type: "category", id: "games", name: t.settings_games, collapsible: true, shown: true, settings: [
                    { type: "custom", id: "list", name: "", inline: false, children: React.createElement(GameManager, { plugin: this }) },
                ] },
                { type: "category", id: "share", name: t.settings_share, collapsible: true, shown: false, settings: [
                    { type: "custom", id: "code", name: "", inline: false, children: React.createElement(ShareView, { plugin: this }) },
                ] },
                { type: "category", id: "stats", name: t.settings_stats, collapsible: true, shown: false, settings: [
                    { type: "custom", id: "totals", name: "", inline: false, children: React.createElement(StatsView, { plugin: this }) },
                ] },
            ].filter(Boolean),
            onChange: (group, id, value) => {
                if (!this.settings || !(id in defaults) || id === "list" || id === "featured") return;
                this.settings[id] = value;
                this.save("settings", this.settings);
                if (id === "active") return value ? this.begin() : this.end();
                if (id === "panelButton") return this.observer();
                if (id === "checkUpdates") return value ? this.checkForUpdate() : undefined;
                if (id === "showPlaying" && this.fakes.length) {
                    const running = this.fakes;
                    this.setFakes([]);
                    this.setFakes(running);
                    return;
                }
                this.refreshBatch();
            },
        });
    }

    css() {
        return `
.mgp-manager { display: flex; flex-direction: column; gap: 12px; color: var(--text-default, #dbdee1); font-size: 14px; }
.mgp-search, .mgp-input, .mgp-select { box-sizing: border-box; height: 40px; padding: 0 12px; border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)); border-radius: 8px; background: var(--input-background, #1e1f22); color: var(--text-default, #dbdee1); font-size: 14px; }
.mgp-search { width: 100%; }
.mgp-input { flex: 1; min-width: 120px; }
.mgp-select { min-width: 160px; }
.mgp-status { color: var(--text-muted, #949ba4); font-size: 12px; }
.mgp-list { display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; background: var(--background-base-low, #2b2d31); }
.mgp-row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 4px 12px; border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06)); }
.mgp-row:first-child { border-top: 0; }
.mgp-icon { flex-shrink: 0; width: 24px; height: 24px; border-radius: 6px; object-fit: cover; background: var(--background-mod-normal, rgba(78, 80, 88, 0.3)); }
.mgp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mgp-time { display: flex; align-items: center; gap: 6px; color: var(--text-muted, #949ba4); font-size: 12px; white-space: nowrap; }
.mgp-minutes { box-sizing: border-box; width: 96px; height: 32px; padding: 0 8px; border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)); border-radius: 8px; background: var(--input-background, #1e1f22); color: var(--text-default, #dbdee1); font-size: 14px; text-align: right; }
.mgp-running { color: var(--status-positive, #23a55a); font-size: 12px; font-weight: 600; white-space: nowrap; }
.mgp-star { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--interactive-normal, #b5bac1); cursor: pointer; }
.mgp-star:hover { background: var(--background-mod-normal, rgba(78, 80, 88, 0.3)); color: var(--interactive-hover, #dbdee1); }
.mgp-star[aria-pressed="true"] { color: var(--status-warning, #f0b232); }
.mgp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mgp-heading { color: var(--header-secondary, #b5bac1); font-size: 12px; font-weight: 600; text-transform: uppercase; }
.mgp-stats { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--text-default, #dbdee1); font-size: 14px; }
.mgp-panel.mgp-panel-on { color: var(--status-positive, #23a55a); }
.mgp-panel.mgp-panel-paused { color: var(--status-warning, #f0b232); }
`;
    }
};

function button(label, onClick, color, disabled = false) {
    const { React, Components } = BdApi;
    const Button = Components?.Button;
    if (Button) return React.createElement(Button, { size: Button.Sizes?.SMALL, color: color === "red" ? Button.Colors?.RED : Button.Colors?.PRIMARY, onClick, disabled }, label);
    return React.createElement("button", { onClick, disabled }, label);
}

function starIcon(filled) {
    const { React } = BdApi;
    return React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: filled ? "currentColor" : "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round", "aria-hidden": "true" },
        React.createElement("path", { d: "M12 2.5l2.94 6.06 6.56.92-4.77 4.6 1.15 6.52L12 17.5l-5.88 3.1 1.15-6.52-4.77-4.6 6.56-.92z" }));
}

function GameIcon({ plugin, game }) {
    const { React } = BdApi;
    const [failed, setFailed] = React.useState(false);
    const url = plugin.iconUrl(game.id);
    return url && !failed ? React.createElement("img", { className: "mgp-icon", src: url, alt: "", loading: "lazy", onError: () => setFailed(true) }) : React.createElement("span", { className: "mgp-icon", "aria-hidden": "true" });
}

function GameManager({ plugin }) {
    const { React } = BdApi;
    const t = plugin.t;
    const [query, setQuery] = React.useState("");
    const [newList, setNewList] = React.useState("");
    const [bulk, setBulk] = React.useState("");
    const [state, setState] = React.useState(plugin.database ? "ready" : "loading");
    const [, setVersion] = React.useState(0);
    const update = () => setVersion(v => v + 1);

    React.useEffect(() => {
        let alive = true;
        if (!plugin.database) plugin.loadDatabase().then(() => alive && setState("ready"), () => alive && setState("failed"));
        plugin.iconListener = update;
        const timer = setInterval(update, MINUTE);
        return () => {
            alive = false;
            if (plugin.iconListener === update) plugin.iconListener = null;
            clearInterval(timer);
        };
    }, []);

    const results = state === "ready" ? plugin.search(query) : [];
    const status = state === "loading" ? t.database_loading : state === "failed" ? t.database_failed : format(t.database_ready, { n: plugin.database.length.toLocaleString() });
    const games = plugin.games;
    const listNames = Object.keys(plugin.lists);

    return React.createElement("div", { className: "mgp-manager" },
        React.createElement("div", { className: "mgp-status" }, plugin.statusText()),
        React.createElement("div", { className: "mgp-actions" },
            React.createElement("select", {
                className: "mgp-select",
                value: plugin.settings.list,
                "aria-label": t.list_select,
                onChange: e => {
                    plugin.switchList(e.target.value);
                    update();
                },
            }, listNames.map(name => React.createElement("option", { key: name, value: name }, `${plugin.listName(name)} (${plugin.lists[name].length})`))),
            React.createElement("input", { className: "mgp-input", value: newList, maxLength: LIST_NAME_LENGTH, placeholder: t.list_newPlaceholder, onChange: e => setNewList(e.target.value) }),
            button(t.button_newList, () => {
                if (plugin.createList(newList)) setNewList("");
                else plugin.api.UI.showToast(t.toast_listExists, { type: "error" });
                update();
            }, null, !newList.trim()),
            button(t.button_deleteList, () => {
                plugin.deleteList(plugin.settings.list);
                update();
            }, "red", plugin.settings.list === MAIN_LIST)
        ),
        React.createElement("input", { className: "mgp-search", type: "search", value: query, placeholder: t.search_placeholder, disabled: state !== "ready", onChange: e => setQuery(e.target.value) }),
        React.createElement("div", { className: "mgp-status" }, status),
        results.length > 0 && React.createElement("div", { className: "mgp-list" }, results.map(game => React.createElement("div", { className: "mgp-row", key: `${game.id}-${game.name}` },
            React.createElement(GameIcon, { plugin, game }),
            React.createElement("span", { className: "mgp-name", title: game.name }, game.name),
            game.id === GTA_V_ID && game.name === "FiveM" && React.createElement("span", { className: "mgp-time" }, t.hint_fivem),
            !game.detected && React.createElement("span", { className: "mgp-time", title: t.hint_noPc }, t.label_noPc),
            button(t.button_add, () => {
                plugin.addGames([game]);
                update();
            })
        ))),
        query.trim() && state === "ready" && !results.length && React.createElement("div", { className: "mgp-status" }, t.search_none),
        React.createElement("div", { className: "mgp-actions" },
            button(format(t.button_random, { n: RANDOM_BATCH }), () => {
                plugin.addGames(plugin.randomGames(RANDOM_BATCH));
                update();
            }, null, state !== "ready"),
            button(t.button_removeAll, () => {
                plugin.removeGame(null);
                update();
            }, "red", !games.length)
        ),
        React.createElement("div", { className: "mgp-heading" }, format(t.list_heading, { n: games.length })),
        games.length > 0 && React.createElement("div", { className: "mgp-status" }, t.note_minutes),
        games.length > 0 && React.createElement("div", { className: "mgp-actions" },
            React.createElement("input", { className: "mgp-minutes", type: "number", min: 1, max: MAX_MINUTES, value: bulk, placeholder: "60", "aria-label": t.bulk_label, onChange: e => setBulk(e.target.value) }),
            React.createElement("span", { className: "mgp-time" }, t.minutes_unit),
            button(t.button_bulk, () => {
                plugin.addMinutesToAll(bulk);
                setBulk("");
                update();
            }, null, !(Number(bulk) > 0))
        ),
        games.length
            ? React.createElement("div", { className: "mgp-list" }, games.map(game => {
                const featured = plugin.settings.featured === game.id;
                return React.createElement("div", { className: "mgp-row", key: game.id },
                    React.createElement(GameIcon, { plugin, game }),
                    React.createElement("span", { className: "mgp-name", title: game.name }, game.name),
                    plugin.isRunning(game.id) && React.createElement("span", { className: "mgp-running" }, t.running),
                    React.createElement("button", {
                        type: "button",
                        className: "mgp-star",
                        "aria-pressed": String(featured),
                        "aria-label": featured ? t.featured_on : t.featured_off,
                        title: featured ? t.featured_on : t.featured_off,
                        onClick: () => {
                            plugin.setFeatured(game.id);
                            update();
                        },
                    }, starIcon(featured)),
                    React.createElement(MinutesField, { plugin, game, onSaved: update }),
                    button(t.button_remove, () => {
                        plugin.removeGame(game.id);
                        update();
                    })
                );
            }))
            : React.createElement("div", { className: "mgp-status" }, t.list_empty)
    );
}

function MinutesField({ plugin, game, onSaved }) {
    const { React } = BdApi;
    const t = plugin.t;
    const stored = plugin.minutes(game.id);
    const [draft, setDraft] = React.useState(null);
    const commit = () => {
        if (draft == null) return;
        plugin.setMinutes(game.id, draft);
        setDraft(null);
        onSaved();
    };
    return React.createElement("label", { className: "mgp-time", title: duration(plugin.stats.seconds[game.id] || 0, t) },
        React.createElement("input", {
            className: "mgp-minutes",
            type: "number",
            min: 0,
            max: MAX_MINUTES,
            step: 1,
            value: draft ?? stored,
            "aria-label": format(t.minutes_label, { game: game.name }),
            onChange: e => setDraft(e.target.value),
            onBlur: commit,
            onKeyDown: e => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setDraft(null);
            },
        }),
        t.minutes_unit
    );
}

function ShareView({ plugin }) {
    const { React } = BdApi;
    const t = plugin.t;
    const [code, setCode] = React.useState("");
    return React.createElement("div", { className: "mgp-manager" },
        React.createElement("div", { className: "mgp-status" }, t.note_share),
        React.createElement("div", { className: "mgp-actions" },
            button(format(t.button_copy, { list: plugin.listName(plugin.settings.list) }), () => plugin.copyList())
        ),
        React.createElement("div", { className: "mgp-actions" },
            React.createElement("input", { className: "mgp-input", value: code, placeholder: t.import_placeholder, onChange: e => setCode(e.target.value) }),
            button(t.button_import, () => {
                if (plugin.importList(code)) setCode("");
            }, null, !code.trim())
        )
    );
}

function StatsView({ plugin }) {
    const { React } = BdApi;
    const t = plugin.t;
    const [, setVersion] = React.useState(0);
    const { seconds, played } = plugin.totals();
    return React.createElement("div", { className: "mgp-stats" },
        React.createElement("span", null, format(t.stats_text, { time: duration(seconds, t), n: played })),
        button(t.button_reset, () => {
            plugin.resetStats();
            setVersion(v => v + 1);
        })
    );
}

const languageNames = {
    en: "English",
    bg: "Български",
    cs: "Čeština",
    da: "Dansk",
    de: "Deutsch",
    el: "Ελληνικά",
    es: "Español",
    fi: "Suomi",
    fr: "Français",
    hi: "हिन्दी",
    hr: "Hrvatski",
    hu: "Magyar",
    id: "Bahasa Indonesia",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    lt: "Lietuvių",
    nl: "Nederlands",
    no: "Norsk",
    pl: "Polski",
    "pt-BR": "Português (Brasil)",
    ro: "Română",
    ru: "Русский",
    "sv-SE": "Svenska",
    th: "ไทย",
    tr: "Türkçe",
    uk: "Українська",
    vi: "Tiếng Việt",
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
};

const labels = {
    en: {
        set_active: "Simulate games",
        note_active: "Keeps running after a restart.",
        set_showPlaying: "Show \"Playing\" on your profile",
        note_showPlaying: "Uses the starred game, otherwise the first one. Playtime counts either way.",
        set_pauseOnReal: "Pause while you really play",
        note_pauseOnReal: "Stops while you play something for real and continues afterwards.",
        set_panelButton: "Button next to mute",
        note_panelButton: "Gamepad icon at the bottom left to turn it on and off.",
        set_atOnce: "Games at the same time",
        atOnce_all: "All (up to {n})",
        set_rotate: "Switch to the next games every",
        note_rotate: "Only does something if your list has more games than run at once.",
        rotate_off: "Never",
        rotate_minutes: "{n} minutes",
        set_scheduleFrom: "Simulate from",
        set_scheduleTo: "Simulate until",
        note_schedule: "Outside these hours it pauses. Same hour means always.",
        hours_any: "Any time",
        set_language: "Language",
        language_auto: "Automatic (Discord language)",
        settings_games: "Games",
        settings_share: "Share list",
        settings_stats: "Statistics",
        status_off: "Simulation is off",
        status_running: "{n} games are running",
        status_pausedReal: "Paused while you play {game}",
        status_pausedSchedule: "Paused until {time}",
        list_select: "Game list",
        list_main: "My games",
        list_newPlaceholder: "Name of a new list",
        button_newList: "New list",
        button_deleteList: "Delete list",
        toast_listExists: "A list with this name already exists",
        search_placeholder: "Search Discord's game list",
        search_none: "No game with this name in Discord's list",
        database_loading: "Loading Discord's game list…",
        database_failed: "Discord's game list could not be loaded. Check your connection and open the settings again.",
        database_ready: "{n} games · \"gta 5\" or \"fivem\" work too",
        hint_fivem: "counts as GTA V",
        label_noPc: "no PC version",
        hint_noPc: "No PC version known to Discord, might not count for badges.",
        button_add: "Add",
        button_remove: "Remove",
        button_random: "Add {n} random games",
        button_removeAll: "Remove all",
        button_reset: "Reset",
        list_heading: "Your games ({n})",
        list_empty: "No games yet.",
        running: "running",
        featured_on: "On your profile",
        featured_off: "Show on profile",
        minutes_unit: "min",
        minutes_label: "Minutes played in {game}",
        note_minutes: "Enter saves. More minutes get sent to Discord, less only changes this list.",
        bulk_label: "Minutes for every game",
        button_bulk: "Add to every game",
        toast_reported: "{n} minutes of {game} reported to Discord",
        toast_reportedAll: "{n} minutes reported for {count} games",
        toast_lowered: "Changed in this list only, Discord does not subtract time",
        toast_reportFailed: "Discord's playtime reporting was not found, nothing was changed",
        duration: "{h} h {m} min",
        stats_text: "Simulated: {time} · Games played: {n}",
        toast_started: "{n} games are running",
        toast_stopped: "Simulation stopped",
        toast_empty: "Add some games first",
        context_add: "Add {game} to MultiGamePlaytime",
        context_owned: "{game} is already in MultiGamePlaytime",
        toast_added: "{game} added",
        toast_alreadyAdded: "{game} is already in your list",
        note_share: "Copy your list as a code or paste one from a friend.",
        button_copy: "Copy \"{list}\"",
        import_placeholder: "Paste a code that starts with MGP1:",
        button_import: "Add games",
        toast_copied: "Code for {n} games copied",
        toast_copyFailed: "The code could not be copied",
        toast_listEmpty: "This list has no games yet",
        toast_importInvalid: "This is not a valid MultiGamePlaytime code",
        toast_imported: "{n} games added",
        set_checkUpdates: "Check for updates",
        note_checkUpdates: "Looks on GitHub for a new version and offers to install it with one click.",
        notice_update: "MultiGamePlaytime {version} is available.",
        button_update: "Update",
        toast_updated: "Updated to {version}",
        toast_updateFailed: "Update failed: {error}",
    },
    de: {
        set_active: "Spiele simulieren",
        note_active: "Läuft nach einem Neustart weiter.",
        set_showPlaying: "„Spielt“ im Profil anzeigen",
        note_showPlaying: "Nimmt das Spiel mit Stern, sonst das erste. Spielzeit zählt so oder so.",
        set_pauseOnReal: "Pausieren, während du wirklich spielst",
        note_pauseOnReal: "Stoppt, solange du wirklich was spielst, und läuft danach weiter.",
        set_panelButton: "Knopf neben Stummschalten",
        note_panelButton: "Gamepad-Symbol unten links zum An- und Ausschalten.",
        set_atOnce: "Spiele gleichzeitig",
        atOnce_all: "Alle (bis {n})",
        set_rotate: "Zu den nächsten Spielen wechseln alle",
        note_rotate: "Bringt nur was, wenn deine Liste mehr Spiele hat, als gleichzeitig laufen.",
        rotate_off: "Nie",
        rotate_minutes: "{n} Minuten",
        set_scheduleFrom: "Simulieren ab",
        set_scheduleTo: "Simulieren bis",
        note_schedule: "Außerhalb dieser Zeit pausiert es. Gleiche Uhrzeit heißt immer.",
        hours_any: "Jederzeit",
        set_language: "Sprache",
        language_auto: "Automatisch (Discord-Sprache)",
        settings_games: "Spiele",
        settings_share: "Liste teilen",
        settings_stats: "Statistik",
        status_off: "Simulation ist aus",
        status_running: "{n} Spiele laufen",
        status_pausedReal: "Pausiert, während du {game} spielst",
        status_pausedSchedule: "Pausiert bis {time}",
        list_select: "Spieleliste",
        list_main: "Meine Spiele",
        list_newPlaceholder: "Name einer neuen Liste",
        button_newList: "Neue Liste",
        button_deleteList: "Liste löschen",
        toast_listExists: "Eine Liste mit diesem Namen gibt es schon",
        search_placeholder: "Discords Spieleliste durchsuchen",
        search_none: "Kein Spiel mit diesem Namen in Discords Liste",
        database_loading: "Discords Spieleliste wird geladen …",
        database_failed: "Discords Spieleliste konnte nicht geladen werden. Prüfe deine Verbindung und öffne die Einstellungen erneut.",
        database_ready: "{n} Spiele · „gta 5“ oder „fivem“ geht auch",
        hint_fivem: "zählt als GTA V",
        label_noPc: "keine PC-Version",
        hint_noPc: "Discord kennt keine PC-Version, zählt vielleicht nicht für Abzeichen.",
        button_add: "Hinzufügen",
        button_remove: "Entfernen",
        button_random: "{n} zufällige Spiele hinzufügen",
        button_removeAll: "Alle entfernen",
        button_reset: "Zurücksetzen",
        list_heading: "Deine Spiele ({n})",
        list_empty: "Noch keine Spiele.",
        running: "läuft",
        featured_on: "Im Profil",
        featured_off: "Im Profil zeigen",
        minutes_unit: "Min.",
        minutes_label: "Gespielte Minuten in {game}",
        note_minutes: "Enter speichert. Mehr Minuten gehen an Discord, weniger ändert nur die Liste.",
        bulk_label: "Minuten für jedes Spiel",
        button_bulk: "Zu jedem Spiel hinzufügen",
        toast_reported: "{n} Minuten {game} an Discord gemeldet",
        toast_reportedAll: "{n} Minuten für {count} Spiele gemeldet",
        toast_lowered: "Nur in dieser Liste geändert, Discord zieht keine Zeit ab",
        toast_reportFailed: "Discords Spielzeit-Meldung wurde nicht gefunden, nichts geändert",
        duration: "{h} Std. {m} Min.",
        stats_text: "Simuliert: {time} · Gespielte Spiele: {n}",
        toast_started: "{n} Spiele laufen",
        toast_stopped: "Simulation beendet",
        toast_empty: "Füg erst ein paar Spiele hinzu",
        context_add: "{game} zu MultiGamePlaytime hinzufügen",
        context_owned: "{game} ist schon in MultiGamePlaytime",
        toast_added: "{game} hinzugefügt",
        toast_alreadyAdded: "{game} ist schon in deiner Liste",
        note_share: "Liste als Code kopieren oder den Code von einem Freund einfügen.",
        button_copy: "„{list}“ kopieren",
        import_placeholder: "Code einfügen, der mit MGP1: beginnt",
        button_import: "Spiele hinzufügen",
        toast_copied: "Code für {n} Spiele kopiert",
        toast_copyFailed: "Der Code konnte nicht kopiert werden",
        toast_listEmpty: "Diese Liste hat noch keine Spiele",
        toast_importInvalid: "Das ist kein gültiger MultiGamePlaytime-Code",
        toast_imported: "{n} Spiele hinzugefügt",
        set_checkUpdates: "Nach Updates suchen",
        note_checkUpdates: "Sucht auf GitHub nach einer neuen Version und bietet die Installation mit einem Klick an.",
        notice_update: "MultiGamePlaytime {version} ist verfügbar.",
        button_update: "Aktualisieren",
        toast_updated: "Auf {version} aktualisiert",
        toast_updateFailed: "Update fehlgeschlagen: {error}",
    },
    bg: {
        set_active: "Симулиране на игри",
        note_active: "Продължава след рестарт.",
        set_showPlaying: "Показване на „Играе“ в профила ти",
        note_showPlaying: "Взима играта със звезда, иначе първата. Времето се брои и така, и така.",
        set_pauseOnReal: "Пауза, докато наистина играеш",
        note_pauseOnReal: "Спира, докато наистина играеш нещо, и продължава след това.",
        set_panelButton: "Бутон до заглушаването",
        note_panelButton: "Иконка на геймпад долу вляво за вкл. и изкл.",
        set_atOnce: "Игри едновременно",
        atOnce_all: "Всички (до {n})",
        set_rotate: "Смяна към следващите игри на всеки",
        note_rotate: "Има смисъл само ако списъкът ти има повече игри, отколкото вървят едновременно.",
        rotate_off: "Никога",
        rotate_minutes: "{n} минути",
        set_scheduleFrom: "Симулиране от",
        set_scheduleTo: "Симулиране до",
        note_schedule: "Извън тези часове е на пауза. Еднакъв час значи винаги.",
        hours_any: "По всяко време",
        set_language: "Език",
        language_auto: "Автоматично (езикът на Discord)",
        settings_games: "Игри",
        settings_share: "Споделяне на списък",
        settings_stats: "Статистика",
        status_off: "Симулацията е изключена",
        status_running: "Вървят {n} игри",
        status_pausedReal: "Пауза, докато играеш {game}",
        status_pausedSchedule: "Пауза до {time}",
        list_select: "Списък с игри",
        list_main: "Моите игри",
        list_newPlaceholder: "Име на нов списък",
        button_newList: "Нов списък",
        button_deleteList: "Изтриване на списъка",
        toast_listExists: "Вече има списък с това име",
        search_placeholder: "Търсене в списъка с игри на Discord",
        search_none: "Няма игра с това име в списъка на Discord",
        database_loading: "Зареждане на списъка с игри на Discord…",
        database_failed: "Списъкът с игри на Discord не можа да се зареди. Провери връзката си и отвори настройките отново.",
        database_ready: "Игри: {n} · „gta 5“ или „fivem“ също работи",
        hint_fivem: "брои се като GTA V",
        label_noPc: "няма версия за PC",
        hint_noPc: "Discord не знае PC версия, може да не се брои за значките.",
        button_add: "Добавяне",
        button_remove: "Премахване",
        button_random: "Добавяне на {n} случайни игри",
        button_removeAll: "Премахване на всички",
        button_reset: "Нулиране",
        list_heading: "Твоите игри ({n})",
        list_empty: "Още няма игри.",
        running: "върви",
        featured_on: "В профила",
        featured_off: "Покажи в профила",
        minutes_unit: "мин",
        minutes_label: "Изиграни минути в {game}",
        note_minutes: "Enter запазва. Повече минути отиват към Discord, по-малко променя само списъка.",
        bulk_label: "Минути за всяка игра",
        button_bulk: "Добавяне към всяка игра",
        toast_reported: "{n} минути в {game} са отчетени пред Discord",
        toast_reportedAll: "{n} минути са отчетени за {count} игри",
        toast_lowered: "Променено само в този списък, Discord не изважда време",
        toast_reportFailed: "Отчитането на времето за игра в Discord не е открито, нищо не е променено",
        duration: "{h} ч {m} мин",
        stats_text: "Симулирано: {time} · Изиграни игри: {n}",
        toast_started: "Вървят {n} игри",
        toast_stopped: "Симулацията е спряна",
        toast_empty: "Първо добави няколко игри",
        context_add: "Добавяне на {game} към MultiGamePlaytime",
        context_owned: "{game} вече е в MultiGamePlaytime",
        toast_added: "Добавено: {game}",
        toast_alreadyAdded: "{game} вече е в списъка ти",
        note_share: "Копирай списъка като код или постави код от приятел.",
        button_copy: "Копиране на „{list}“",
        import_placeholder: "Постави код, който започва с MGP1:",
        button_import: "Добавяне на игри",
        toast_copied: "Копиран е код за {n} игри",
        toast_copyFailed: "Кодът не можа да се копира",
        toast_listEmpty: "Този списък още няма игри",
        toast_importInvalid: "Това не е валиден код за MultiGamePlaytime",
        toast_imported: "Добавени са {n} игри",
        set_checkUpdates: "Проверка за актуализации",
        note_checkUpdates: "Търси нова версия в GitHub и предлага инсталиране с едно щракване.",
        notice_update: "Налична е MultiGamePlaytime {version}.",
        button_update: "Актуализиране",
        toast_updated: "Актуализирано до {version}",
        toast_updateFailed: "Актуализацията не успя: {error}",
    },
    cs: {
        set_active: "Simulovat hry",
        note_active: "Běží dál i po restartu.",
        set_showPlaying: "Zobrazit „Hraje“ na profilu",
        note_showPlaying: "Použije hru s hvězdičkou, jinak první. Herní čas se počítá tak jako tak.",
        set_pauseOnReal: "Pozastavit, když opravdu hraješ",
        note_pauseOnReal: "Zastaví se, když opravdu něco hraješ, a pak pokračuje.",
        set_panelButton: "Tlačítko vedle ztlumení",
        note_panelButton: "Ikona gamepadu vlevo dole pro zapnutí a vypnutí.",
        set_atOnce: "Počet her najednou",
        atOnce_all: "Všechny (až {n})",
        set_rotate: "Přepnout na další hry každých",
        note_rotate: "Má smysl jen tehdy, když máš v seznamu víc her, než jich běží najednou.",
        rotate_off: "Nikdy",
        rotate_minutes: "{n} minut",
        set_scheduleFrom: "Simulovat od",
        set_scheduleTo: "Simulovat do",
        note_schedule: "Mimo tyto hodiny je pauza. Stejná hodina znamená vždy.",
        hours_any: "Kdykoli",
        set_language: "Jazyk",
        language_auto: "Automaticky (jazyk Discordu)",
        settings_games: "Hry",
        settings_share: "Sdílet seznam",
        settings_stats: "Statistika",
        status_off: "Simulace je vypnutá",
        status_running: "Běžící hry: {n}",
        status_pausedReal: "Pozastaveno, zatímco hraješ {game}",
        status_pausedSchedule: "Pozastaveno do {time}",
        list_select: "Seznam her",
        list_main: "Moje hry",
        list_newPlaceholder: "Název nového seznamu",
        button_newList: "Nový seznam",
        button_deleteList: "Smazat seznam",
        toast_listExists: "Seznam s tímto názvem už existuje",
        search_placeholder: "Hledat v seznamu her Discordu",
        search_none: "V seznamu Discordu není žádná hra s tímto názvem",
        database_loading: "Načítání seznamu her Discordu…",
        database_failed: "Seznam her Discordu se nepodařilo načíst. Zkontroluj připojení a otevři nastavení znovu.",
        database_ready: "Her: {n} · funguje i „gta 5“ nebo „fivem“",
        hint_fivem: "počítá se jako GTA V",
        label_noPc: "bez verze pro PC",
        hint_noPc: "Discord nezná verzi pro PC, nemusí se počítat do odznaků.",
        button_add: "Přidat",
        button_remove: "Odebrat",
        button_random: "Přidat náhodné hry ({n})",
        button_removeAll: "Odebrat vše",
        button_reset: "Vynulovat",
        list_heading: "Tvoje hry ({n})",
        list_empty: "Zatím žádné hry.",
        running: "běží",
        featured_on: "V profilu",
        featured_off: "Zobrazit v profilu",
        minutes_unit: "min",
        minutes_label: "Odehrané minuty ve hře {game}",
        note_minutes: "Enter uloží. Víc minut se pošle Discordu, méně změní jen seznam.",
        bulk_label: "Minuty pro každou hru",
        button_bulk: "Přidat ke každé hře",
        toast_reported: "Discordu nahlášeno {n} min ve hře {game}",
        toast_reportedAll: "Nahlášeno {n} min pro každou hru (počet her: {count})",
        toast_lowered: "Změněno jen v tomto seznamu, Discord čas neodečte",
        toast_reportFailed: "Hlášení herního času Discordu nebylo nalezeno, nic se nezměnilo",
        duration: "{h} h {m} min",
        stats_text: "Simulováno: {time} · Odehrané hry: {n}",
        toast_started: "Běžící hry: {n}",
        toast_stopped: "Simulace zastavena",
        toast_empty: "Nejdřív přidej pár her",
        context_add: "Přidat {game} do MultiGamePlaytime",
        context_owned: "{game} už je v MultiGamePlaytime",
        toast_added: "Přidáno: {game}",
        toast_alreadyAdded: "{game} už je v tvém seznamu",
        note_share: "Zkopíruj seznam jako kód nebo vlož kód od kamaráda.",
        button_copy: "Kopírovat „{list}“",
        import_placeholder: "Vlož kód, který začíná MGP1:",
        button_import: "Přidat hry",
        toast_copied: "Kód zkopírován (počet her: {n})",
        toast_copyFailed: "Kód se nepodařilo zkopírovat",
        toast_listEmpty: "Tento seznam zatím nemá žádné hry",
        toast_importInvalid: "Toto není platný kód MultiGamePlaytime",
        toast_imported: "Přidané hry: {n}",
        set_checkUpdates: "Hledat aktualizace",
        note_checkUpdates: "Hledá novou verzi na GitHubu a nabídne instalaci jedním kliknutím.",
        notice_update: "MultiGamePlaytime {version} je k dispozici.",
        button_update: "Aktualizovat",
        toast_updated: "Aktualizováno na {version}",
        toast_updateFailed: "Aktualizace selhala: {error}",
    },
    da: {
        set_active: "Simulér spil",
        note_active: "Kører videre efter en genstart.",
        set_showPlaying: "Vis »Spiller« på din profil",
        note_showPlaying: "Bruger spillet med stjerne, ellers det første. Spilletid tæller uanset hvad.",
        set_pauseOnReal: "Sæt på pause, mens du spiller rigtigt",
        note_pauseOnReal: "Stopper, mens du rigtigt spiller noget, og fortsætter bagefter.",
        set_panelButton: "Knap ved siden af lydløs",
        note_panelButton: "Gamepad-ikon nederst til venstre til at slå det til og fra.",
        set_atOnce: "Spil på samme tid",
        atOnce_all: "Alle (op til {n})",
        set_rotate: "Skift til de næste spil hver",
        note_rotate: "Gør kun noget, hvis din liste har flere spil, end der kører på én gang.",
        rotate_off: "Aldrig",
        rotate_minutes: "{n} minutter",
        set_scheduleFrom: "Simulér fra",
        set_scheduleTo: "Simulér indtil",
        note_schedule: "Uden for disse timer holder det pause. Samme time betyder altid.",
        hours_any: "Når som helst",
        set_language: "Sprog",
        language_auto: "Automatisk (Discords sprog)",
        settings_games: "Spil",
        settings_share: "Del liste",
        settings_stats: "Statistik",
        status_off: "Simulering er slået fra",
        status_running: "{n} spil kører",
        status_pausedReal: "På pause, mens du spiller {game}",
        status_pausedSchedule: "På pause indtil {time}",
        list_select: "Spilliste",
        list_main: "Mine spil",
        list_newPlaceholder: "Navn på en ny liste",
        button_newList: "Ny liste",
        button_deleteList: "Slet liste",
        toast_listExists: "Der findes allerede en liste med dette navn",
        search_placeholder: "Søg i Discords spilliste",
        search_none: "Intet spil med dette navn i Discords liste",
        database_loading: "Indlæser Discords spilliste…",
        database_failed: "Discords spilliste kunne ikke indlæses. Tjek din forbindelse, og åbn indstillingerne igen.",
        database_ready: "{n} spil · \"gta 5\" eller \"fivem\" virker også",
        hint_fivem: "tæller som GTA V",
        label_noPc: "ingen PC-version",
        hint_noPc: "Discord kender ingen pc-version, tæller måske ikke med til badges.",
        button_add: "Tilføj",
        button_remove: "Fjern",
        button_random: "Tilføj {n} tilfældige spil",
        button_removeAll: "Fjern alle",
        button_reset: "Nulstil",
        list_heading: "Dine spil ({n})",
        list_empty: "Ingen spil endnu.",
        running: "kører",
        featured_on: "På din profil",
        featured_off: "Vis på profil",
        minutes_unit: "min.",
        minutes_label: "Minutter spillet i {game}",
        note_minutes: "Enter gemmer. Flere minutter sendes til Discord, færre ændrer kun listen.",
        bulk_label: "Minutter til hvert spil",
        button_bulk: "Tilføj til hvert spil",
        toast_reported: "{n} minutter i {game} rapporteret til Discord",
        toast_reportedAll: "{n} minutter rapporteret for {count} spil",
        toast_lowered: "Kun ændret i denne liste, Discord trækker ikke tid fra",
        toast_reportFailed: "Discords rapportering af spilletid blev ikke fundet, intet blev ændret",
        duration: "{h} t. {m} min.",
        stats_text: "Simuleret: {time} · Spil spillet: {n}",
        toast_started: "{n} spil kører",
        toast_stopped: "Simulering stoppet",
        toast_empty: "Tilføj nogle spil først",
        context_add: "Tilføj {game} til MultiGamePlaytime",
        context_owned: "{game} er allerede i MultiGamePlaytime",
        toast_added: "{game} tilføjet",
        toast_alreadyAdded: "{game} er allerede på din liste",
        note_share: "Kopiér din liste som kode eller indsæt en fra en ven.",
        button_copy: "Kopiér »{list}«",
        import_placeholder: "Indsæt en kode, der starter med MGP1:",
        button_import: "Tilføj spil",
        toast_copied: "Kode til {n} spil kopieret",
        toast_copyFailed: "Koden kunne ikke kopieres",
        toast_listEmpty: "Denne liste har ingen spil endnu",
        toast_importInvalid: "Dette er ikke en gyldig MultiGamePlaytime-kode",
        toast_imported: "{n} spil tilføjet",
        set_checkUpdates: "Søg efter opdateringer",
        note_checkUpdates: "Søger efter en ny version på GitHub og tilbyder at installere den med ét klik.",
        notice_update: "MultiGamePlaytime {version} er tilgængelig.",
        button_update: "Opdater",
        toast_updated: "Opdateret til {version}",
        toast_updateFailed: "Opdatering mislykkedes: {error}",
    },
    el: {
        set_active: "Προσομοίωση παιχνιδιών",
        note_active: "Συνεχίζει και μετά από επανεκκίνηση.",
        set_showPlaying: "Εμφάνιση «Παίζει» στο προφίλ σου",
        note_showPlaying: "Παίρνει το παιχνίδι με αστέρι, αλλιώς το πρώτο. Ο χρόνος μετράει έτσι κι αλλιώς.",
        set_pauseOnReal: "Παύση όσο παίζεις πραγματικά",
        note_pauseOnReal: "Σταματά όσο παίζεις κάτι στ' αλήθεια και συνεχίζει μετά.",
        set_panelButton: "Κουμπί δίπλα στη σίγαση",
        note_panelButton: "Εικονίδιο χειριστηρίου κάτω αριστερά για άνοιγμα και κλείσιμο.",
        set_atOnce: "Παιχνίδια ταυτόχρονα",
        atOnce_all: "Όλα (έως {n})",
        set_rotate: "Αλλαγή στα επόμενα παιχνίδια κάθε",
        note_rotate: "Έχει νόημα μόνο αν η λίστα σου έχει περισσότερα παιχνίδια απ' όσα τρέχουν μαζί.",
        rotate_off: "Ποτέ",
        rotate_minutes: "{n} λεπτά",
        set_scheduleFrom: "Προσομοίωση από",
        set_scheduleTo: "Προσομοίωση έως",
        note_schedule: "Εκτός αυτών των ωρών κάνει παύση. Ίδια ώρα σημαίνει πάντα.",
        hours_any: "Οποτεδήποτε",
        set_language: "Γλώσσα",
        language_auto: "Αυτόματα (γλώσσα του Discord)",
        settings_games: "Παιχνίδια",
        settings_share: "Κοινοποίηση λίστας",
        settings_stats: "Στατιστικά",
        status_off: "Η προσομοίωση είναι απενεργοποιημένη",
        status_running: "Τρέχουν {n} παιχνίδια",
        status_pausedReal: "Σε παύση όσο παίζεις {game}",
        status_pausedSchedule: "Σε παύση έως {time}",
        list_select: "Λίστα παιχνιδιών",
        list_main: "Τα παιχνίδια μου",
        list_newPlaceholder: "Όνομα νέας λίστας",
        button_newList: "Νέα λίστα",
        button_deleteList: "Διαγραφή λίστας",
        toast_listExists: "Υπάρχει ήδη λίστα με αυτό το όνομα",
        search_placeholder: "Αναζήτηση στη λίστα παιχνιδιών του Discord",
        search_none: "Δεν υπάρχει παιχνίδι με αυτό το όνομα στη λίστα του Discord",
        database_loading: "Φόρτωση της λίστας παιχνιδιών του Discord…",
        database_failed: "Δεν ήταν δυνατή η φόρτωση της λίστας παιχνιδιών του Discord. Έλεγξε τη σύνδεσή σου και άνοιξε ξανά τις ρυθμίσεις.",
        database_ready: "Παιχνίδια: {n} · δουλεύει και «gta 5» ή «fivem»",
        hint_fivem: "μετράει ως GTA V",
        label_noPc: "χωρίς έκδοση για PC",
        hint_noPc: "Το Discord δεν ξέρει έκδοση για PC, ίσως δεν μετράει για τα σήματα.",
        button_add: "Προσθήκη",
        button_remove: "Αφαίρεση",
        button_random: "Προσθήκη {n} τυχαίων παιχνιδιών",
        button_removeAll: "Αφαίρεση όλων",
        button_reset: "Επαναφορά",
        list_heading: "Τα παιχνίδια σου ({n})",
        list_empty: "Δεν υπάρχουν παιχνίδια ακόμα.",
        running: "τρέχει",
        featured_on: "Στο προφίλ σου",
        featured_off: "Εμφάνιση στο προφίλ",
        minutes_unit: "λεπ.",
        minutes_label: "Λεπτά παιχνιδιού στο {game}",
        note_minutes: "Το Enter αποθηκεύει. Περισσότερα λεπτά πάνε στο Discord, λιγότερα αλλάζουν μόνο τη λίστα.",
        bulk_label: "Λεπτά για κάθε παιχνίδι",
        button_bulk: "Προσθήκη σε κάθε παιχνίδι",
        toast_reported: "{n} λεπτά στο {game} αναφέρθηκαν στο Discord",
        toast_reportedAll: "{n} λεπτά αναφέρθηκαν για {count} παιχνίδια",
        toast_lowered: "Άλλαξε μόνο σε αυτή τη λίστα, το Discord δεν αφαιρεί χρόνο",
        toast_reportFailed: "Δεν βρέθηκε η αναφορά χρόνου παιχνιδιού του Discord, δεν άλλαξε τίποτα",
        duration: "{h} ώρ. {m} λεπ.",
        stats_text: "Προσομοίωση: {time} · Παιχνίδια που παίχτηκαν: {n}",
        toast_started: "Τρέχουν {n} παιχνίδια",
        toast_stopped: "Η προσομοίωση σταμάτησε",
        toast_empty: "Πρόσθεσε πρώτα μερικά παιχνίδια",
        context_add: "Προσθήκη του {game} στο MultiGamePlaytime",
        context_owned: "Το {game} υπάρχει ήδη στο MultiGamePlaytime",
        toast_added: "Το {game} προστέθηκε",
        toast_alreadyAdded: "Το {game} υπάρχει ήδη στη λίστα σου",
        note_share: "Αντέγραψε τη λίστα σου ως κωδικό ή επικόλλησε έναν από φίλο.",
        button_copy: "Αντιγραφή «{list}»",
        import_placeholder: "Επικόλλησε έναν κωδικό που ξεκινά με MGP1:",
        button_import: "Προσθήκη παιχνιδιών",
        toast_copied: "Αντιγράφηκε ο κωδικός για {n} παιχνίδια",
        toast_copyFailed: "Δεν ήταν δυνατή η αντιγραφή του κωδικού",
        toast_listEmpty: "Αυτή η λίστα δεν έχει ακόμα παιχνίδια",
        toast_importInvalid: "Αυτός δεν είναι έγκυρος κωδικός MultiGamePlaytime",
        toast_imported: "Προστέθηκαν {n} παιχνίδια",
        set_checkUpdates: "Έλεγχος για ενημερώσεις",
        note_checkUpdates: "Αναζητά νέα έκδοση στο GitHub και προτείνει εγκατάσταση με ένα κλικ.",
        notice_update: "Το MultiGamePlaytime {version} είναι διαθέσιμο.",
        button_update: "Ενημέρωση",
        toast_updated: "Ενημερώθηκε στην {version}",
        toast_updateFailed: "Η ενημέρωση απέτυχε: {error}",
    },
    es: {
        set_active: "Simular juegos",
        note_active: "Sigue activo después de reiniciar.",
        set_showPlaying: "Mostrar «Jugando» en tu perfil",
        note_showPlaying: "Usa el juego con estrella, si no el primero. El tiempo cuenta igual.",
        set_pauseOnReal: "Pausar mientras juegas de verdad",
        note_pauseOnReal: "Se para mientras juegas algo de verdad y sigue después.",
        set_panelButton: "Botón junto a silenciar",
        note_panelButton: "Icono de mando abajo a la izquierda para activarlo y desactivarlo.",
        set_atOnce: "Juegos a la vez",
        atOnce_all: "Todos (hasta {n})",
        set_rotate: "Cambiar a los siguientes juegos cada",
        note_rotate: "Solo sirve si tu lista tiene más juegos de los que corren a la vez.",
        rotate_off: "Nunca",
        rotate_minutes: "{n} minutos",
        set_scheduleFrom: "Simular desde",
        set_scheduleTo: "Simular hasta",
        note_schedule: "Fuera de este horario se pausa. La misma hora significa siempre.",
        hours_any: "Cualquier hora",
        set_language: "Idioma",
        language_auto: "Automático (idioma de Discord)",
        settings_games: "Juegos",
        settings_share: "Compartir lista",
        settings_stats: "Estadísticas",
        status_off: "La simulación está desactivada",
        status_running: "{n} juegos en marcha",
        status_pausedReal: "En pausa mientras juegas a {game}",
        status_pausedSchedule: "En pausa hasta {time}",
        list_select: "Lista de juegos",
        list_main: "Mis juegos",
        list_newPlaceholder: "Nombre de una lista nueva",
        button_newList: "Nueva lista",
        button_deleteList: "Eliminar lista",
        toast_listExists: "Ya existe una lista con este nombre",
        search_placeholder: "Buscar en la lista de juegos de Discord",
        search_none: "No hay ningún juego con este nombre en la lista de Discord",
        database_loading: "Cargando la lista de juegos de Discord…",
        database_failed: "No se pudo cargar la lista de juegos de Discord. Comprueba tu conexión y vuelve a abrir los ajustes.",
        database_ready: "{n} juegos · también vale «gta 5» o «fivem»",
        hint_fivem: "cuenta como GTA V",
        label_noPc: "sin versión para PC",
        hint_noPc: "Discord no conoce versión de PC, puede que no cuente para las insignias.",
        button_add: "Añadir",
        button_remove: "Quitar",
        button_random: "Añadir {n} juegos aleatorios",
        button_removeAll: "Quitar todos",
        button_reset: "Restablecer",
        list_heading: "Tus juegos ({n})",
        list_empty: "Aún no hay juegos.",
        running: "en marcha",
        featured_on: "En tu perfil",
        featured_off: "Mostrar en el perfil",
        minutes_unit: "min",
        minutes_label: "Minutos jugados a {game}",
        note_minutes: "Enter guarda. Los minutos de más se envían a Discord, bajar solo cambia la lista.",
        bulk_label: "Minutos para cada juego",
        button_bulk: "Añadir a cada juego",
        toast_reported: "{n} minutos de {game} enviados a Discord",
        toast_reportedAll: "{n} minutos enviados para {count} juegos",
        toast_lowered: "Cambiado solo en esta lista, Discord no resta tiempo",
        toast_reportFailed: "No se encontró el registro de tiempo de juego de Discord, no se ha cambiado nada",
        duration: "{h} h {m} min",
        stats_text: "Simulado: {time} · Juegos jugados: {n}",
        toast_started: "{n} juegos en marcha",
        toast_stopped: "Simulación detenida",
        toast_empty: "Añade algunos juegos primero",
        context_add: "Añadir {game} a MultiGamePlaytime",
        context_owned: "{game} ya está en MultiGamePlaytime",
        toast_added: "{game} añadido",
        toast_alreadyAdded: "{game} ya está en tu lista",
        note_share: "Copia tu lista como código o pega uno de un amigo.",
        button_copy: "Copiar «{list}»",
        import_placeholder: "Pega un código que empiece por MGP1:",
        button_import: "Añadir juegos",
        toast_copied: "Código de {n} juegos copiado",
        toast_copyFailed: "No se pudo copiar el código",
        toast_listEmpty: "Esta lista aún no tiene juegos",
        toast_importInvalid: "Este no es un código válido de MultiGamePlaytime",
        toast_imported: "{n} juegos añadidos",
        set_checkUpdates: "Buscar actualizaciones",
        note_checkUpdates: "Busca una nueva versión en GitHub y ofrece instalarla con un clic.",
        notice_update: "MultiGamePlaytime {version} está disponible.",
        button_update: "Actualizar",
        toast_updated: "Actualizado a {version}",
        toast_updateFailed: "Error al actualizar: {error}",
    },
    fi: {
        set_active: "Simuloi pelejä",
        note_active: "Jatkuu uudelleenkäynnistyksen jälkeen.",
        set_showPlaying: "Näytä ”Pelaa” profiilissasi",
        note_showPlaying: "Käyttää tähdellä merkittyä peliä, muuten ensimmäistä. Peliaika kertyy joka tapauksessa.",
        set_pauseOnReal: "Keskeytä, kun pelaat oikeasti",
        note_pauseOnReal: "Pysähtyy, kun pelaat jotain oikeasti, ja jatkuu sen jälkeen.",
        set_panelButton: "Painike mykistyksen vieressä",
        note_panelButton: "Ohjainkuvake vasemmalla alhaalla päälle ja pois kytkemiseen.",
        set_atOnce: "Pelejä samanaikaisesti",
        atOnce_all: "Kaikki (enintään {n})",
        set_rotate: "Vaihtoväli seuraaviin peleihin",
        note_rotate: "Vaikuttaa vain, jos listallasi on enemmän pelejä kuin kerralla käynnissä.",
        rotate_off: "Ei koskaan",
        rotate_minutes: "{n} minuuttia",
        set_scheduleFrom: "Simulointi alkaa",
        set_scheduleTo: "Simulointi päättyy",
        note_schedule: "Näiden tuntien ulkopuolella tauolla. Sama tunti tarkoittaa aina.",
        hours_any: "Milloin tahansa",
        set_language: "Kieli",
        language_auto: "Automaattinen (Discordin kieli)",
        settings_games: "Pelit",
        settings_share: "Jaa lista",
        settings_stats: "Tilastot",
        status_off: "Simulointi on pois päältä",
        status_running: "{n} peliä käynnissä",
        status_pausedReal: "Tauolla, kun pelaat peliä {game}",
        status_pausedSchedule: "Tauolla {time} asti",
        list_select: "Pelilista",
        list_main: "Omat pelit",
        list_newPlaceholder: "Uuden listan nimi",
        button_newList: "Uusi lista",
        button_deleteList: "Poista lista",
        toast_listExists: "Tämänniminen lista on jo olemassa",
        search_placeholder: "Hae Discordin pelilistasta",
        search_none: "Discordin listassa ei ole tämännimistä peliä",
        database_loading: "Ladataan Discordin pelilistaa…",
        database_failed: "Discordin pelilistaa ei voitu ladata. Tarkista yhteytesi ja avaa asetukset uudelleen.",
        database_ready: "Pelejä: {n} · myös \"gta 5\" tai \"fivem\" toimii",
        hint_fivem: "lasketaan GTA V:ksi",
        label_noPc: "ei PC-versiota",
        hint_noPc: "Discord ei tunne PC-versiota, ei ehkä lasketa merkkeihin.",
        button_add: "Lisää",
        button_remove: "Poista",
        button_random: "Lisää {n} satunnaista peliä",
        button_removeAll: "Poista kaikki",
        button_reset: "Nollaa",
        list_heading: "Pelisi ({n})",
        list_empty: "Ei vielä pelejä.",
        running: "käynnissä",
        featured_on: "Profiilissasi",
        featured_off: "Näytä profiilissa",
        minutes_unit: "min",
        minutes_label: "Pelatut minuutit: {game}",
        note_minutes: "Enter tallentaa. Lisätyt minuutit lähtevät Discordiin, vähennys muuttaa vain listaa.",
        bulk_label: "Minuutit jokaiselle pelille",
        button_bulk: "Lisää jokaiselle pelille",
        toast_reported: "{game}: {n} min ilmoitettu Discordille",
        toast_reportedAll: "{n} min ilmoitettu {count} pelille",
        toast_lowered: "Muutettu vain tähän listaan, Discord ei vähennä aikaa",
        toast_reportFailed: "Discordin peliajan ilmoitusta ei löytynyt, mitään ei muutettu",
        duration: "{h} t {m} min",
        stats_text: "Simuloitu: {time} · Pelattuja pelejä: {n}",
        toast_started: "{n} peliä käynnissä",
        toast_stopped: "Simulointi pysäytetty",
        toast_empty: "Lisää ensin muutama peli",
        context_add: "Lisää {game} MultiGamePlaytime-listaan",
        context_owned: "{game} on jo MultiGamePlaytime-listassa",
        toast_added: "{game} lisätty",
        toast_alreadyAdded: "{game} on jo listallasi",
        note_share: "Kopioi lista koodina tai liitä kaverin koodi.",
        button_copy: "Kopioi ”{list}”",
        import_placeholder: "Liitä koodi, joka alkaa MGP1:",
        button_import: "Lisää pelit",
        toast_copied: "{n} pelin koodi kopioitu",
        toast_copyFailed: "Koodia ei voitu kopioida",
        toast_listEmpty: "Tällä listalla ei ole vielä pelejä",
        toast_importInvalid: "Tämä ei ole kelvollinen MultiGamePlaytime-koodi",
        toast_imported: "{n} peliä lisätty",
        set_checkUpdates: "Tarkista päivitykset",
        note_checkUpdates: "Etsii uutta versiota GitHubista ja tarjoaa asennusta yhdellä napsautuksella.",
        notice_update: "MultiGamePlaytime {version} on saatavilla.",
        button_update: "Päivitä",
        toast_updated: "Päivitetty versioon {version}",
        toast_updateFailed: "Päivitys epäonnistui: {error}",
    },
    fr: {
        set_active: "Simuler des jeux",
        note_active: "Continue après un redémarrage.",
        set_showPlaying: "Afficher « Joue à » sur ton profil",
        note_showPlaying: "Prend le jeu avec l'étoile, sinon le premier. Le temps compte dans tous les cas.",
        set_pauseOnReal: "Mettre en pause quand tu joues vraiment",
        note_pauseOnReal: "S'arrête pendant que tu joues vraiment et reprend après.",
        set_panelButton: "Bouton à côté de la sourdine",
        note_panelButton: "Icône de manette en bas à gauche pour l'activer ou le désactiver.",
        set_atOnce: "Jeux en même temps",
        atOnce_all: "Tous (jusqu'à {n})",
        set_rotate: "Passer aux jeux suivants toutes les",
        note_rotate: "Utile seulement si ta liste a plus de jeux que ceux lancés en même temps.",
        rotate_off: "Jamais",
        rotate_minutes: "{n} minutes",
        set_scheduleFrom: "Simuler à partir de",
        set_scheduleTo: "Simuler jusqu'à",
        note_schedule: "En dehors de ces heures, ça se met en pause. La même heure veut dire toujours.",
        hours_any: "N'importe quand",
        set_language: "Langue",
        language_auto: "Automatique (langue de Discord)",
        settings_games: "Jeux",
        settings_share: "Partager la liste",
        settings_stats: "Statistiques",
        status_off: "La simulation est désactivée",
        status_running: "{n} jeux sont lancés",
        status_pausedReal: "En pause pendant que tu joues à {game}",
        status_pausedSchedule: "En pause jusqu'à {time}",
        list_select: "Liste de jeux",
        list_main: "Mes jeux",
        list_newPlaceholder: "Nom d'une nouvelle liste",
        button_newList: "Nouvelle liste",
        button_deleteList: "Supprimer la liste",
        toast_listExists: "Une liste porte déjà ce nom",
        search_placeholder: "Rechercher dans la liste de jeux de Discord",
        search_none: "Aucun jeu de ce nom dans la liste de Discord",
        database_loading: "Chargement de la liste de jeux de Discord…",
        database_failed: "Impossible de charger la liste de jeux de Discord. Vérifie ta connexion et rouvre les paramètres.",
        database_ready: "{n} jeux · « gta 5 » ou « fivem » marche aussi",
        hint_fivem: "compte comme GTA V",
        label_noPc: "pas de version PC",
        hint_noPc: "Discord ne connaît pas de version PC, peut ne pas compter pour les badges.",
        button_add: "Ajouter",
        button_remove: "Retirer",
        button_random: "Ajouter {n} jeux au hasard",
        button_removeAll: "Tout retirer",
        button_reset: "Réinitialiser",
        list_heading: "Tes jeux ({n})",
        list_empty: "Pas encore de jeux.",
        running: "lancé",
        featured_on: "Sur ton profil",
        featured_off: "Afficher sur le profil",
        minutes_unit: "min",
        minutes_label: "Minutes jouées à {game}",
        note_minutes: "Entrée enregistre. Les minutes en plus partent à Discord, en moins ça ne change que la liste.",
        bulk_label: "Minutes pour chaque jeu",
        button_bulk: "Ajouter à chaque jeu",
        toast_reported: "{n} minutes de {game} signalées à Discord",
        toast_reportedAll: "{n} minutes signalées pour {count} jeux",
        toast_lowered: "Modifié dans cette liste uniquement, Discord ne retire pas de temps",
        toast_reportFailed: "Le signalement du temps de jeu de Discord est introuvable, rien n'a été modifié",
        duration: "{h} h {m} min",
        stats_text: "Simulé : {time} · Jeux joués : {n}",
        toast_started: "{n} jeux sont lancés",
        toast_stopped: "Simulation arrêtée",
        toast_empty: "Ajoute d'abord quelques jeux",
        context_add: "Ajouter {game} à MultiGamePlaytime",
        context_owned: "{game} est déjà dans MultiGamePlaytime",
        toast_added: "{game} ajouté",
        toast_alreadyAdded: "{game} est déjà dans ta liste",
        note_share: "Copie ta liste en code ou colle celui d'un ami.",
        button_copy: "Copier « {list} »",
        import_placeholder: "Colle un code qui commence par MGP1:",
        button_import: "Ajouter les jeux",
        toast_copied: "Code de {n} jeux copié",
        toast_copyFailed: "Impossible de copier le code",
        toast_listEmpty: "Cette liste n'a encore aucun jeu",
        toast_importInvalid: "Ce n'est pas un code MultiGamePlaytime valide",
        toast_imported: "{n} jeux ajoutés",
        set_checkUpdates: "Rechercher des mises à jour",
        note_checkUpdates: "Cherche une nouvelle version sur GitHub et propose de l'installer en un clic.",
        notice_update: "MultiGamePlaytime {version} est disponible.",
        button_update: "Mettre à jour",
        toast_updated: "Mis à jour vers {version}",
        toast_updateFailed: "Échec de la mise à jour : {error}",
    },
    hi: {
        set_active: "गेम सिमुलेट करें",
        note_active: "रीस्टार्ट के बाद भी चलता रहता है।",
        set_showPlaying: "अपनी प्रोफ़ाइल पर \"खेल रहे हैं\" दिखाएँ",
        note_showPlaying: "स्टार वाला गेम लेता है, नहीं तो पहला। प्लेटाइम दोनों तरह गिना जाता है।",
        set_pauseOnReal: "जब आप सच में खेलें, तब रोकें",
        note_pauseOnReal: "जब तुम सच में कुछ खेलते हो तब रुकता है, फिर चलता है।",
        set_panelButton: "म्यूट के पास बटन",
        note_panelButton: "चालू और बंद करने के लिए नीचे बाईं ओर गेमपैड आइकन।",
        set_atOnce: "एक साथ चलने वाले गेम",
        atOnce_all: "सभी ({n} तक)",
        set_rotate: "अगले गेम पर जाने का अंतराल",
        note_rotate: "तभी काम आता है जब सूची में एक साथ चलने वाले गेम से ज़्यादा गेम हों।",
        rotate_off: "कभी नहीं",
        rotate_minutes: "{n} मिनट",
        set_scheduleFrom: "सिमुलेशन शुरू",
        set_scheduleTo: "सिमुलेशन समाप्त",
        note_schedule: "इन घंटों के बाहर रुका रहता है। एक ही घंटा मतलब हमेशा।",
        hours_any: "किसी भी समय",
        set_language: "भाषा",
        language_auto: "अपने आप (Discord की भाषा)",
        settings_games: "गेम",
        settings_share: "सूची शेयर करें",
        settings_stats: "आँकड़े",
        status_off: "सिमुलेशन बंद है",
        status_running: "{n} गेम चल रहे हैं",
        status_pausedReal: "रुका हुआ, जब तक आप {game} खेल रहे हैं",
        status_pausedSchedule: "{time} तक रुका हुआ",
        list_select: "गेम सूची",
        list_main: "मेरे गेम",
        list_newPlaceholder: "नई सूची का नाम",
        button_newList: "नई सूची",
        button_deleteList: "सूची हटाएँ",
        toast_listExists: "इस नाम की सूची पहले से मौजूद है",
        search_placeholder: "Discord की गेम सूची में खोजें",
        search_none: "Discord की सूची में इस नाम का कोई गेम नहीं है",
        database_loading: "Discord की गेम सूची लोड हो रही है…",
        database_failed: "Discord की गेम सूची लोड नहीं हो सकी। अपना कनेक्शन जाँचें और सेटिंग्स फिर से खोलें।",
        database_ready: "गेम: {n} · \"gta 5\" या \"fivem\" भी चलता है",
        hint_fivem: "GTA V के रूप में गिना जाता है",
        label_noPc: "PC संस्करण नहीं",
        hint_noPc: "Discord को इसका PC वर्ज़न नहीं पता, शायद बैज में न गिना जाए।",
        button_add: "जोड़ें",
        button_remove: "हटाएँ",
        button_random: "{n} रैंडम गेम जोड़ें",
        button_removeAll: "सभी हटाएँ",
        button_reset: "रीसेट करें",
        list_heading: "आपके गेम ({n})",
        list_empty: "अभी कोई गेम नहीं।",
        running: "चल रहा है",
        featured_on: "प्रोफ़ाइल पर",
        featured_off: "प्रोफ़ाइल पर दिखाएँ",
        minutes_unit: "मि",
        minutes_label: "{game} में खेले गए मिनट",
        note_minutes: "Enter से सेव होता है। ज़्यादा मिनट Discord को जाते हैं, कम करने से बस सूची बदलती है।",
        bulk_label: "हर गेम के लिए मिनट",
        button_bulk: "हर गेम में जोड़ें",
        toast_reported: "{game} के {n} मिनट Discord को भेजे गए",
        toast_reportedAll: "{count} गेम के लिए {n} मिनट भेजे गए",
        toast_lowered: "सिर्फ़ इस सूची में बदला गया, Discord समय नहीं घटाता",
        toast_reportFailed: "Discord की खेलने के समय की रिपोर्टिंग नहीं मिली, कुछ नहीं बदला गया",
        duration: "{h} घं {m} मि",
        stats_text: "सिमुलेट किया गया: {time} · खेले गए गेम: {n}",
        toast_started: "{n} गेम चल रहे हैं",
        toast_stopped: "सिमुलेशन रोका गया",
        toast_empty: "पहले कुछ गेम जोड़ो",
        context_add: "{game} को MultiGamePlaytime में जोड़ें",
        context_owned: "{game} पहले से MultiGamePlaytime में है",
        toast_added: "{game} जोड़ा गया",
        toast_alreadyAdded: "{game} पहले से आपकी सूची में है",
        note_share: "अपनी सूची कोड के रूप में कॉपी करो या किसी दोस्त का कोड पेस्ट करो।",
        button_copy: "\"{list}\" कॉपी करें",
        import_placeholder: "MGP1: से शुरू होने वाला कोड पेस्ट करें",
        button_import: "गेम जोड़ें",
        toast_copied: "{n} गेम का कोड कॉपी किया गया",
        toast_copyFailed: "कोड कॉपी नहीं हो सका",
        toast_listEmpty: "इस सूची में अभी कोई गेम नहीं है",
        toast_importInvalid: "यह मान्य MultiGamePlaytime कोड नहीं है",
        toast_imported: "{n} गेम जोड़े गए",
        set_checkUpdates: "अपडेट की जाँच करें",
        note_checkUpdates: "GitHub पर नया संस्करण खोजता है और एक क्लिक में इंस्टॉल करने का विकल्प देता है।",
        notice_update: "MultiGamePlaytime {version} उपलब्ध है।",
        button_update: "अपडेट करें",
        toast_updated: "{version} पर अपडेट हो गया",
        toast_updateFailed: "अपडेट विफल: {error}",
    },
    hr: {
        set_active: "Simuliraj igre",
        note_active: "Radi i nakon ponovnog pokretanja.",
        set_showPlaying: "Prikaži „Igra” na profilu",
        note_showPlaying: "Uzima igru sa zvjezdicom, inače prvu. Vrijeme se broji u svakom slučaju.",
        set_pauseOnReal: "Pauziraj dok stvarno igraš",
        note_pauseOnReal: "Staje dok stvarno nešto igraš i nastavlja poslije.",
        set_panelButton: "Gumb pokraj utišavanja",
        note_panelButton: "Ikona kontrolera dolje lijevo za uključivanje i isključivanje.",
        set_atOnce: "Igre istodobno",
        atOnce_all: "Sve (do {n})",
        set_rotate: "Prijeđi na sljedeće igre svakih",
        note_rotate: "Ima smisla samo ako ti je na popisu više igara nego što ih radi odjednom.",
        rotate_off: "Nikad",
        rotate_minutes: "{n} minuta",
        set_scheduleFrom: "Simuliraj od",
        set_scheduleTo: "Simuliraj do",
        note_schedule: "Izvan ovih sati je pauza. Isti sat znači uvijek.",
        hours_any: "Bilo kada",
        set_language: "Jezik",
        language_auto: "Automatski (jezik Discorda)",
        settings_games: "Igre",
        settings_share: "Podijeli popis",
        settings_stats: "Statistika",
        status_off: "Simulacija je isključena",
        status_running: "Pokrenute igre: {n}",
        status_pausedReal: "Pauzirano dok igraš {game}",
        status_pausedSchedule: "Pauzirano do {time}",
        list_select: "Popis igara",
        list_main: "Moje igre",
        list_newPlaceholder: "Naziv novog popisa",
        button_newList: "Novi popis",
        button_deleteList: "Izbriši popis",
        toast_listExists: "Popis s tim nazivom već postoji",
        search_placeholder: "Pretraži Discordov popis igara",
        search_none: "Na Discordovom popisu nema igre s tim nazivom",
        database_loading: "Učitavanje Discordova popisa igara…",
        database_failed: "Discordov popis igara nije se mogao učitati. Provjeri vezu i ponovno otvori postavke.",
        database_ready: "Igre: {n} · radi i „gta 5” ili „fivem”",
        hint_fivem: "računa se kao GTA V",
        label_noPc: "nema PC verzije",
        hint_noPc: "Discord ne zna PC verziju, možda se ne računa za značke.",
        button_add: "Dodaj",
        button_remove: "Ukloni",
        button_random: "Dodaj nasumične igre: {n}",
        button_removeAll: "Ukloni sve",
        button_reset: "Poništi",
        list_heading: "Tvoje igre ({n})",
        list_empty: "Još nema igara.",
        running: "radi",
        featured_on: "Na tvom profilu",
        featured_off: "Prikaži na profilu",
        minutes_unit: "min",
        minutes_label: "Odigrane minute u igri {game}",
        note_minutes: "Enter sprema. Više minuta ide Discordu, manje mijenja samo popis.",
        bulk_label: "Minute za svaku igru",
        button_bulk: "Dodaj svakoj igri",
        toast_reported: "Discordu prijavljene minute za {game}: {n}",
        toast_reportedAll: "Prijavljeno minuta: {n}, igara: {count}",
        toast_lowered: "Promijenjeno samo na ovom popisu, Discord ne oduzima vrijeme",
        toast_reportFailed: "Discordova prijava vremena igranja nije pronađena, ništa nije promijenjeno",
        duration: "{h} h {m} min",
        stats_text: "Simulirano: {time} · Odigrane igre: {n}",
        toast_started: "Pokrenute igre: {n}",
        toast_stopped: "Simulacija zaustavljena",
        toast_empty: "Prvo dodaj nekoliko igara",
        context_add: "Dodaj {game} u MultiGamePlaytime",
        context_owned: "{game} je već u MultiGamePlaytime",
        toast_added: "Dodano: {game}",
        toast_alreadyAdded: "{game} je već na tvom popisu",
        note_share: "Kopiraj popis kao kod ili zalijepi kod od prijatelja.",
        button_copy: "Kopiraj „{list}”",
        import_placeholder: "Zalijepi kod koji počinje s MGP1:",
        button_import: "Dodaj igre",
        toast_copied: "Kod kopiran, igara: {n}",
        toast_copyFailed: "Kod se nije mogao kopirati",
        toast_listEmpty: "Ovaj popis još nema igara",
        toast_importInvalid: "Ovo nije valjani MultiGamePlaytime kod",
        toast_imported: "Dodane igre: {n}",
        set_checkUpdates: "Provjeravaj ažuriranja",
        note_checkUpdates: "Traži novu verziju na GitHubu i nudi instalaciju jednim klikom.",
        notice_update: "MultiGamePlaytime {version} je dostupan.",
        button_update: "Ažuriraj",
        toast_updated: "Ažurirano na {version}",
        toast_updateFailed: "Ažuriranje nije uspjelo: {error}",
    },
    hu: {
        set_active: "Játékok szimulálása",
        note_active: "Újraindítás után is fut tovább.",
        set_showPlaying: "„Játszik” megjelenítése a profilodon",
        note_showPlaying: "A csillagos játékot használja, különben az elsőt. A játékidő így is, úgy is számít.",
        set_pauseOnReal: "Szünet, amíg tényleg játszol",
        note_pauseOnReal: "Megáll, amíg tényleg játszol valamivel, utána folytatja.",
        set_panelButton: "Gomb a némítás mellett",
        note_panelButton: "Kontroller ikon bal lent a be- és kikapcsoláshoz.",
        set_atOnce: "Egyszerre futó játékok",
        atOnce_all: "Mind (legfeljebb {n})",
        set_rotate: "Váltás a következő játékokra ennyi időnként",
        note_rotate: "Csak akkor számít, ha több játék van a listádon, mint amennyi egyszerre fut.",
        rotate_off: "Soha",
        rotate_minutes: "{n} perc",
        set_scheduleFrom: "Szimulálás ettől",
        set_scheduleTo: "Szimulálás eddig",
        note_schedule: "Ezeken az órákon kívül szünetel. Azonos óra azt jelenti: mindig.",
        hours_any: "Bármikor",
        set_language: "Nyelv",
        language_auto: "Automatikus (a Discord nyelve)",
        settings_games: "Játékok",
        settings_share: "Lista megosztása",
        settings_stats: "Statisztika",
        status_off: "A szimuláció ki van kapcsolva",
        status_running: "{n} játék fut",
        status_pausedReal: "Szünetel, amíg ezzel játszol: {game}",
        status_pausedSchedule: "Szünetel eddig: {time}",
        list_select: "Játéklista",
        list_main: "Saját játékok",
        list_newPlaceholder: "Új lista neve",
        button_newList: "Új lista",
        button_deleteList: "Lista törlése",
        toast_listExists: "Már van ilyen nevű lista",
        search_placeholder: "Keresés a Discord játéklistájában",
        search_none: "Nincs ilyen nevű játék a Discord listájában",
        database_loading: "A Discord játéklistájának betöltése…",
        database_failed: "Nem sikerült betölteni a Discord játéklistáját. Ellenőrizd a kapcsolatot, és nyisd meg újra a beállításokat.",
        database_ready: "Játékok: {n} · a „gta 5” vagy „fivem” is működik",
        hint_fivem: "GTA V-nek számít",
        label_noPc: "nincs PC-s verzió",
        hint_noPc: "A Discord nem ismer PC-verziót, lehet, hogy nem számít a jelvényekhez.",
        button_add: "Hozzáadás",
        button_remove: "Eltávolítás",
        button_random: "{n} véletlen játék hozzáadása",
        button_removeAll: "Összes eltávolítása",
        button_reset: "Visszaállítás",
        list_heading: "Játékaid ({n})",
        list_empty: "Még nincs játék.",
        running: "fut",
        featured_on: "A profilodon",
        featured_off: "Mutasd a profilon",
        minutes_unit: "perc",
        minutes_label: "Játszott percek: {game}",
        note_minutes: "Enter ment. A több perc megy a Discordnak, a kevesebb csak a listát változtatja.",
        bulk_label: "Percek minden játékhoz",
        button_bulk: "Hozzáadás minden játékhoz",
        toast_reported: "{game}: {n} perc jelentve a Discordnak",
        toast_reportedAll: "{n} perc jelentve {count} játékhoz",
        toast_lowered: "Csak ebben a listában módosult, a Discord nem von le időt",
        toast_reportFailed: "Nem található a Discord játékidő-jelentése, semmi sem változott",
        duration: "{h} ó {m} p",
        stats_text: "Szimulálva: {time} · Játszott játékok: {n}",
        toast_started: "{n} játék fut",
        toast_stopped: "Szimuláció leállítva",
        toast_empty: "Előbb adj hozzá pár játékot",
        context_add: "{game} hozzáadása a MultiGamePlaytime-hoz",
        context_owned: "{game} már szerepel a MultiGamePlaytime-ban",
        toast_added: "{game} hozzáadva",
        toast_alreadyAdded: "{game} már szerepel a listádon",
        note_share: "Másold ki a listát kódként, vagy illessz be egyet egy baráttól.",
        button_copy: "„{list}” másolása",
        import_placeholder: "Illessz be egy kódot, amely így kezdődik: MGP1:",
        button_import: "Játékok hozzáadása",
        toast_copied: "Kód kimásolva {n} játékhoz",
        toast_copyFailed: "Nem sikerült kimásolni a kódot",
        toast_listEmpty: "Ebben a listában még nincsenek játékok",
        toast_importInvalid: "Ez nem érvényes MultiGamePlaytime-kód",
        toast_imported: "{n} játék hozzáadva",
        set_checkUpdates: "Frissítések keresése",
        note_checkUpdates: "Új verziót keres a GitHubon, és felajánlja a telepítését egy kattintással.",
        notice_update: "Elérhető a MultiGamePlaytime {version}.",
        button_update: "Frissítés",
        toast_updated: "Frissítve erre: {version}",
        toast_updateFailed: "A frissítés sikertelen: {error}",
    },
    id: {
        set_active: "Simulasikan game",
        note_active: "Tetap jalan setelah restart.",
        set_showPlaying: "Tampilkan \"Bermain\" di profilmu",
        note_showPlaying: "Pakai game berbintang, kalau tidak ada ya yang pertama. Waktu main tetap dihitung.",
        set_pauseOnReal: "Jeda saat kamu benar-benar bermain",
        note_pauseOnReal: "Berhenti saat kamu benar-benar main sesuatu, lalu lanjut lagi.",
        set_panelButton: "Tombol di samping bisukan",
        note_panelButton: "Ikon gamepad di kiri bawah untuk menyalakan dan mematikan.",
        set_atOnce: "Game sekaligus",
        atOnce_all: "Semua (hingga {n})",
        set_rotate: "Ganti ke game berikutnya setiap",
        note_rotate: "Cuma berguna kalau daftarmu punya lebih banyak game daripada yang jalan bersamaan.",
        rotate_off: "Tidak pernah",
        rotate_minutes: "{n} menit",
        set_scheduleFrom: "Simulasikan mulai",
        set_scheduleTo: "Simulasikan sampai",
        note_schedule: "Di luar jam ini dijeda. Jam yang sama berarti selalu.",
        hours_any: "Kapan saja",
        set_language: "Bahasa",
        language_auto: "Otomatis (bahasa Discord)",
        settings_games: "Game",
        settings_share: "Bagikan daftar",
        settings_stats: "Statistik",
        status_off: "Simulasi nonaktif",
        status_running: "{n} game sedang berjalan",
        status_pausedReal: "Dijeda selama kamu bermain {game}",
        status_pausedSchedule: "Dijeda sampai {time}",
        list_select: "Daftar game",
        list_main: "Game saya",
        list_newPlaceholder: "Nama daftar baru",
        button_newList: "Daftar baru",
        button_deleteList: "Hapus daftar",
        toast_listExists: "Daftar dengan nama ini sudah ada",
        search_placeholder: "Cari di daftar game Discord",
        search_none: "Tidak ada game dengan nama ini di daftar Discord",
        database_loading: "Memuat daftar game Discord…",
        database_failed: "Daftar game Discord tidak dapat dimuat. Periksa koneksimu dan buka pengaturan lagi.",
        database_ready: "{n} game · \"gta 5\" atau \"fivem\" juga bisa",
        hint_fivem: "dihitung sebagai GTA V",
        label_noPc: "tidak ada versi PC",
        hint_noPc: "Discord tidak kenal versi PC-nya, mungkin tidak dihitung untuk lencana.",
        button_add: "Tambah",
        button_remove: "Hapus",
        button_random: "Tambah {n} game acak",
        button_removeAll: "Hapus semua",
        button_reset: "Atur ulang",
        list_heading: "Game-mu ({n})",
        list_empty: "Belum ada game.",
        running: "berjalan",
        featured_on: "Di profilmu",
        featured_off: "Tampilkan di profil",
        minutes_unit: "mnt",
        minutes_label: "Menit bermain di {game}",
        note_minutes: "Enter menyimpan. Menit tambahan dikirim ke Discord, mengurangi cuma mengubah daftar.",
        bulk_label: "Menit untuk setiap game",
        button_bulk: "Tambahkan ke setiap game",
        toast_reported: "{n} menit {game} dilaporkan ke Discord",
        toast_reportedAll: "{n} menit dilaporkan untuk {count} game",
        toast_lowered: "Hanya diubah di daftar ini, Discord tidak mengurangi waktu",
        toast_reportFailed: "Pelaporan waktu bermain Discord tidak ditemukan, tidak ada yang diubah",
        duration: "{h} j {m} mnt",
        stats_text: "Disimulasikan: {time} · Game dimainkan: {n}",
        toast_started: "{n} game sedang berjalan",
        toast_stopped: "Simulasi dihentikan",
        toast_empty: "Tambahkan beberapa game dulu",
        context_add: "Tambahkan {game} ke MultiGamePlaytime",
        context_owned: "{game} sudah ada di MultiGamePlaytime",
        toast_added: "{game} ditambahkan",
        toast_alreadyAdded: "{game} sudah ada di daftarmu",
        note_share: "Salin daftarmu sebagai kode atau tempel kode dari teman.",
        button_copy: "Salin \"{list}\"",
        import_placeholder: "Tempel kode yang diawali MGP1:",
        button_import: "Tambahkan game",
        toast_copied: "Kode untuk {n} game disalin",
        toast_copyFailed: "Kode tidak dapat disalin",
        toast_listEmpty: "Daftar ini belum berisi game",
        toast_importInvalid: "Ini bukan kode MultiGamePlaytime yang valid",
        toast_imported: "{n} game ditambahkan",
        set_checkUpdates: "Periksa pembaruan",
        note_checkUpdates: "Mencari versi baru di GitHub dan menawarkan pemasangan dengan satu klik.",
        notice_update: "MultiGamePlaytime {version} tersedia.",
        button_update: "Perbarui",
        toast_updated: "Diperbarui ke {version}",
        toast_updateFailed: "Pembaruan gagal: {error}",
    },
    it: {
        set_active: "Simula giochi",
        note_active: "Continua dopo un riavvio.",
        set_showPlaying: "Mostra «Sta giocando a» nel tuo profilo",
        note_showPlaying: "Usa il gioco con la stella, altrimenti il primo. Il tempo conta comunque.",
        set_pauseOnReal: "Metti in pausa mentre giochi davvero",
        note_pauseOnReal: "Si ferma mentre giochi davvero a qualcosa e riparte dopo.",
        set_panelButton: "Pulsante accanto al muto",
        note_panelButton: "Icona del controller in basso a sinistra per attivarlo e disattivarlo.",
        set_atOnce: "Giochi contemporaneamente",
        atOnce_all: "Tutti (fino a {n})",
        set_rotate: "Passa ai giochi successivi ogni",
        note_rotate: "Serve solo se la tua lista ha più giochi di quelli che girano insieme.",
        rotate_off: "Mai",
        rotate_minutes: "{n} minuti",
        set_scheduleFrom: "Simula dalle",
        set_scheduleTo: "Simula fino alle",
        note_schedule: "Fuori da questi orari è in pausa. La stessa ora vuol dire sempre.",
        hours_any: "Qualsiasi ora",
        set_language: "Lingua",
        language_auto: "Automatica (lingua di Discord)",
        settings_games: "Giochi",
        settings_share: "Condividi lista",
        settings_stats: "Statistiche",
        status_off: "La simulazione è disattivata",
        status_running: "{n} giochi in esecuzione",
        status_pausedReal: "In pausa mentre giochi a {game}",
        status_pausedSchedule: "In pausa fino alle {time}",
        list_select: "Lista di giochi",
        list_main: "I miei giochi",
        list_newPlaceholder: "Nome di una nuova lista",
        button_newList: "Nuova lista",
        button_deleteList: "Elimina lista",
        toast_listExists: "Esiste già una lista con questo nome",
        search_placeholder: "Cerca nella lista di giochi di Discord",
        search_none: "Nessun gioco con questo nome nella lista di Discord",
        database_loading: "Caricamento della lista di giochi di Discord…",
        database_failed: "Impossibile caricare la lista di giochi di Discord. Controlla la connessione e riapri le impostazioni.",
        database_ready: "{n} giochi · funziona anche «gta 5» o «fivem»",
        hint_fivem: "conta come GTA V",
        label_noPc: "nessuna versione PC",
        hint_noPc: "Discord non conosce una versione PC, potrebbe non contare per i badge.",
        button_add: "Aggiungi",
        button_remove: "Rimuovi",
        button_random: "Aggiungi {n} giochi casuali",
        button_removeAll: "Rimuovi tutti",
        button_reset: "Reimposta",
        list_heading: "I tuoi giochi ({n})",
        list_empty: "Ancora nessun gioco.",
        running: "in esecuzione",
        featured_on: "Sul tuo profilo",
        featured_off: "Mostra sul profilo",
        minutes_unit: "min",
        minutes_label: "Minuti giocati a {game}",
        note_minutes: "Invio salva. I minuti in più vanno a Discord, meno cambia solo la lista.",
        bulk_label: "Minuti per ogni gioco",
        button_bulk: "Aggiungi a ogni gioco",
        toast_reported: "{n} minuti di {game} segnalati a Discord",
        toast_reportedAll: "{n} minuti segnalati per {count} giochi",
        toast_lowered: "Modificato solo in questa lista, Discord non sottrae tempo",
        toast_reportFailed: "La segnalazione del tempo di gioco di Discord non è stata trovata, non è cambiato nulla",
        duration: "{h} h {m} min",
        stats_text: "Simulato: {time} · Giochi giocati: {n}",
        toast_started: "{n} giochi in esecuzione",
        toast_stopped: "Simulazione interrotta",
        toast_empty: "Aggiungi prima qualche gioco",
        context_add: "Aggiungi {game} a MultiGamePlaytime",
        context_owned: "{game} è già in MultiGamePlaytime",
        toast_added: "{game} aggiunto",
        toast_alreadyAdded: "{game} è già nella tua lista",
        note_share: "Copia la lista come codice o incolla quello di un amico.",
        button_copy: "Copia «{list}»",
        import_placeholder: "Incolla un codice che inizia con MGP1:",
        button_import: "Aggiungi giochi",
        toast_copied: "Codice per {n} giochi copiato",
        toast_copyFailed: "Impossibile copiare il codice",
        toast_listEmpty: "Questa lista non ha ancora giochi",
        toast_importInvalid: "Questo non è un codice MultiGamePlaytime valido",
        toast_imported: "{n} giochi aggiunti",
        set_checkUpdates: "Cerca aggiornamenti",
        note_checkUpdates: "Cerca una nuova versione su GitHub e propone di installarla con un clic.",
        notice_update: "MultiGamePlaytime {version} è disponibile.",
        button_update: "Aggiorna",
        toast_updated: "Aggiornato a {version}",
        toast_updateFailed: "Aggiornamento non riuscito: {error}",
    },
    ja: {
        set_active: "ゲームをシミュレート",
        note_active: "再起動後も続きます。",
        set_showPlaying: "プロフィールに「プレイ中」を表示",
        note_showPlaying: "星を付けたゲーム、なければ最初のゲームを使います。プレイ時間はどちらでも加算されます。",
        set_pauseOnReal: "実際にプレイしている間は一時停止",
        note_pauseOnReal: "実際に何かをプレイしている間は止まり、終わると再開します。",
        set_panelButton: "ミュートの横のボタン",
        note_panelButton: "左下のゲームパッドアイコンでオン・オフを切り替えます。",
        set_atOnce: "同時に実行するゲーム数",
        atOnce_all: "すべて（最大 {n}）",
        set_rotate: "次のゲームに切り替える間隔",
        note_rotate: "同時に動かす数よりリストのゲームが多いときだけ効きます。",
        rotate_off: "しない",
        rotate_minutes: "{n} 分",
        set_scheduleFrom: "シミュレーションの開始",
        set_scheduleTo: "シミュレーションの終了",
        note_schedule: "この時間外は一時停止します。同じ時刻ならずっと動きます。",
        hours_any: "いつでも",
        set_language: "言語",
        language_auto: "自動（Discord の言語）",
        settings_games: "ゲーム",
        settings_share: "リストを共有",
        settings_stats: "統計",
        status_off: "シミュレーションはオフです",
        status_running: "{n} 本のゲームを実行中",
        status_pausedReal: "{game} をプレイ中のため一時停止中",
        status_pausedSchedule: "{time} まで一時停止中",
        list_select: "ゲームリスト",
        list_main: "マイゲーム",
        list_newPlaceholder: "新しいリストの名前",
        button_newList: "新しいリスト",
        button_deleteList: "リストを削除",
        toast_listExists: "この名前のリストはすでにあります",
        search_placeholder: "Discord のゲームリストを検索",
        search_none: "Discord のリストにこの名前のゲームはありません",
        database_loading: "Discord のゲームリストを読み込み中…",
        database_failed: "Discord のゲームリストを読み込めませんでした。接続を確認して、設定をもう一度開いてください。",
        database_ready: "ゲーム{n}件 · 「gta 5」や「fivem」でも探せます",
        hint_fivem: "GTA V として扱われます",
        label_noPc: "PC 版なし",
        hint_noPc: "DiscordにPC版の情報がなく、バッジに数えられないかもしれません。",
        button_add: "追加",
        button_remove: "削除",
        button_random: "ランダムなゲームを {n} 本追加",
        button_removeAll: "すべて削除",
        button_reset: "リセット",
        list_heading: "あなたのゲーム（{n}）",
        list_empty: "まだゲームがありません。",
        running: "実行中",
        featured_on: "プロフィールに表示中",
        featured_off: "プロフィールに表示",
        minutes_unit: "分",
        minutes_label: "{game} のプレイ時間（分）",
        note_minutes: "Enterで保存。増やした分はDiscordに送られ、減らすとリストだけ変わります。",
        bulk_label: "すべてのゲームに追加する分数",
        button_bulk: "すべてのゲームに追加",
        toast_reported: "{game} の {n} 分を Discord に報告しました",
        toast_reportedAll: "{count} 本のゲームに {n} 分を報告しました",
        toast_lowered: "このリストのみ変更しました。Discord の時間は減りません",
        toast_reportFailed: "Discord のプレイ時間の報告機能が見つからないため、何も変更されませんでした",
        duration: "{h}時間{m}分",
        stats_text: "シミュレーション時間: {time} · プレイしたゲーム: {n}",
        toast_started: "{n} 本のゲームを実行中",
        toast_stopped: "シミュレーションを停止しました",
        toast_empty: "先にゲームを追加してください",
        context_add: "{game} を MultiGamePlaytime に追加",
        context_owned: "{game} はすでに MultiGamePlaytime にあります",
        toast_added: "{game} を追加しました",
        toast_alreadyAdded: "{game} はすでにリストにあります",
        note_share: "リストをコードとしてコピーするか、友達のコードを貼り付けます。",
        button_copy: "「{list}」をコピー",
        import_placeholder: "MGP1: で始まるコードを貼り付け",
        button_import: "ゲームを追加",
        toast_copied: "{n} 本のゲームのコードをコピーしました",
        toast_copyFailed: "コードをコピーできませんでした",
        toast_listEmpty: "このリストにはまだゲームがありません",
        toast_importInvalid: "有効な MultiGamePlaytime コードではありません",
        toast_imported: "{n} 本のゲームを追加しました",
        set_checkUpdates: "アップデートを確認",
        note_checkUpdates: "GitHubで新しいバージョンを探し、ワンクリックでのインストールを提案します。",
        notice_update: "MultiGamePlaytime {version} が利用可能です。",
        button_update: "アップデート",
        toast_updated: "{version} にアップデートしました",
        toast_updateFailed: "アップデートに失敗しました: {error}",
    },
    ko: {
        set_active: "게임 시뮬레이션",
        note_active: "재시작 후에도 계속됩니다.",
        set_showPlaying: "프로필에 \"플레이 중\" 표시",
        note_showPlaying: "별표한 게임, 없으면 첫 번째 게임을 씁니다. 플레이 시간은 어느 쪽이든 쌓입니다.",
        set_pauseOnReal: "실제로 플레이하는 동안 일시 정지",
        note_pauseOnReal: "실제로 게임을 하는 동안 멈추고, 끝나면 다시 이어갑니다.",
        set_panelButton: "음소거 옆 버튼",
        note_panelButton: "왼쪽 아래 게임패드 아이콘으로 켜고 끕니다.",
        set_atOnce: "동시에 실행할 게임",
        atOnce_all: "모두 (최대 {n}개)",
        set_rotate: "다음 게임으로 전환하는 간격",
        note_rotate: "동시에 돌리는 수보다 목록에 게임이 많을 때만 의미가 있습니다.",
        rotate_off: "안 함",
        rotate_minutes: "{n}분",
        set_scheduleFrom: "시뮬레이션 시작",
        set_scheduleTo: "시뮬레이션 종료",
        note_schedule: "이 시간 밖에서는 멈춥니다. 같은 시간이면 항상입니다.",
        hours_any: "언제나",
        set_language: "언어",
        language_auto: "자동 (Discord 언어)",
        settings_games: "게임",
        settings_share: "목록 공유",
        settings_stats: "통계",
        status_off: "시뮬레이션이 꺼져 있습니다",
        status_running: "게임 {n}개 실행 중",
        status_pausedReal: "{game} 플레이 중이라 일시 정지됨",
        status_pausedSchedule: "{time}까지 일시 정지됨",
        list_select: "게임 목록",
        list_main: "내 게임",
        list_newPlaceholder: "새 목록 이름",
        button_newList: "새 목록",
        button_deleteList: "목록 삭제",
        toast_listExists: "같은 이름의 목록이 이미 있습니다",
        search_placeholder: "Discord 게임 목록 검색",
        search_none: "Discord 목록에 이 이름의 게임이 없습니다",
        database_loading: "Discord 게임 목록을 불러오는 중…",
        database_failed: "Discord 게임 목록을 불러오지 못했습니다. 연결을 확인하고 설정을 다시 여세요.",
        database_ready: "게임 {n}개 · \"gta 5\"나 \"fivem\"도 됩니다",
        hint_fivem: "GTA V로 집계됨",
        label_noPc: "PC 버전 없음",
        hint_noPc: "Discord에 PC 버전 정보가 없어 배지에 안 셀 수도 있습니다.",
        button_add: "추가",
        button_remove: "제거",
        button_random: "무작위 게임 {n}개 추가",
        button_removeAll: "모두 제거",
        button_reset: "초기화",
        list_heading: "내 게임 ({n})",
        list_empty: "아직 게임이 없습니다.",
        running: "실행 중",
        featured_on: "프로필에 표시 중",
        featured_off: "프로필에 표시",
        minutes_unit: "분",
        minutes_label: "{game} 플레이 시간(분)",
        note_minutes: "Enter로 저장. 늘린 분은 Discord로 보내고, 줄이면 목록만 바뀝니다.",
        bulk_label: "모든 게임에 추가할 분",
        button_bulk: "모든 게임에 추가",
        toast_reported: "{game} {n}분을 Discord에 보고했습니다",
        toast_reportedAll: "게임 {count}개에 {n}분씩 보고했습니다",
        toast_lowered: "이 목록에서만 변경되었습니다. Discord에서 시간이 차감되지 않습니다",
        toast_reportFailed: "Discord 플레이 시간 보고 기능을 찾지 못해 아무것도 변경하지 않았습니다",
        duration: "{h}시간 {m}분",
        stats_text: "시뮬레이션: {time} · 플레이한 게임: {n}개",
        toast_started: "게임 {n}개 실행 중",
        toast_stopped: "시뮬레이션을 중지했습니다",
        toast_empty: "먼저 게임을 몇 개 추가하세요",
        context_add: "MultiGamePlaytime에 {game} 추가",
        context_owned: "{game}은(는) 이미 MultiGamePlaytime에 있습니다",
        toast_added: "{game}을(를) 추가했습니다",
        toast_alreadyAdded: "{game}은(는) 이미 목록에 있습니다",
        note_share: "목록을 코드로 복사하거나 친구의 코드를 붙여넣으세요.",
        button_copy: "\"{list}\" 복사",
        import_placeholder: "MGP1:로 시작하는 코드 붙여 넣기",
        button_import: "게임 추가",
        toast_copied: "게임 {n}개의 코드를 복사했습니다",
        toast_copyFailed: "코드를 복사하지 못했습니다",
        toast_listEmpty: "이 목록에는 아직 게임이 없습니다",
        toast_importInvalid: "유효한 MultiGamePlaytime 코드가 아닙니다",
        toast_imported: "게임 {n}개를 추가했습니다",
        set_checkUpdates: "업데이트 확인",
        note_checkUpdates: "GitHub에서 새 버전을 찾아 클릭 한 번으로 설치하도록 안내합니다.",
        notice_update: "MultiGamePlaytime {version}을(를) 사용할 수 있습니다.",
        button_update: "업데이트",
        toast_updated: "{version}(으)로 업데이트했습니다",
        toast_updateFailed: "업데이트 실패: {error}",
    },
    lt: {
        set_active: "Simuliuoti žaidimus",
        note_active: "Veikia ir po paleidimo iš naujo.",
        set_showPlaying: "Rodyti „Žaidžia“ profilyje",
        note_showPlaying: "Naudoja žvaigždute pažymėtą žaidimą, kitaip pirmąjį. Laikas skaičiuojamas bet kuriuo atveju.",
        set_pauseOnReal: "Pristabdyti, kai iš tikrųjų žaidi",
        note_pauseOnReal: "Sustoja, kol iš tikrųjų ką nors žaidi, ir tęsia po to.",
        set_panelButton: "Mygtukas šalia nutildymo",
        note_panelButton: "Pultelio piktograma apačioje kairėje įjungti ir išjungti.",
        set_atOnce: "Žaidimų vienu metu",
        atOnce_all: "Visi (iki {n})",
        set_rotate: "Pereiti prie kitų žaidimų kas",
        note_rotate: "Prasminga tik tada, kai sąraše yra daugiau žaidimų, nei veikia vienu metu.",
        rotate_off: "Niekada",
        rotate_minutes: "{n} min.",
        set_scheduleFrom: "Simuliuoti nuo",
        set_scheduleTo: "Simuliuoti iki",
        note_schedule: "Už šių valandų ribų – pauzė. Ta pati valanda reiškia visada.",
        hours_any: "Bet kada",
        set_language: "Kalba",
        language_auto: "Automatiškai (Discord kalba)",
        settings_games: "Žaidimai",
        settings_share: "Bendrinti sąrašą",
        settings_stats: "Statistika",
        status_off: "Simuliacija išjungta",
        status_running: "Veikia žaidimų: {n}",
        status_pausedReal: "Pristabdyta, kol žaidi {game}",
        status_pausedSchedule: "Pristabdyta iki {time}",
        list_select: "Žaidimų sąrašas",
        list_main: "Mano žaidimai",
        list_newPlaceholder: "Naujo sąrašo pavadinimas",
        button_newList: "Naujas sąrašas",
        button_deleteList: "Ištrinti sąrašą",
        toast_listExists: "Sąrašas tokiu pavadinimu jau yra",
        search_placeholder: "Ieškoti Discord žaidimų sąraše",
        search_none: "Discord sąraše nėra žaidimo tokiu pavadinimu",
        database_loading: "Įkeliamas Discord žaidimų sąrašas…",
        database_failed: "Nepavyko įkelti Discord žaidimų sąrašo. Patikrink ryšį ir vėl atidaryk nustatymus.",
        database_ready: "Žaidimai: {n} · veikia ir „gta 5“ ar „fivem“",
        hint_fivem: "skaičiuojamas kaip GTA V",
        label_noPc: "nėra PC versijos",
        hint_noPc: "Discord nežino PC versijos, gali būti neįskaičiuota į ženklelius.",
        button_add: "Pridėti",
        button_remove: "Pašalinti",
        button_random: "Pridėti atsitiktinių žaidimų: {n}",
        button_removeAll: "Pašalinti visus",
        button_reset: "Nustatyti iš naujo",
        list_heading: "Tavo žaidimai ({n})",
        list_empty: "Žaidimų dar nėra.",
        running: "veikia",
        featured_on: "Tavo profilyje",
        featured_off: "Rodyti profilyje",
        minutes_unit: "min.",
        minutes_label: "Žaista minučių žaidime {game}",
        note_minutes: "Enter išsaugo. Daugiau minučių siunčiama į Discord, mažiau keičia tik sąrašą.",
        bulk_label: "Minutės kiekvienam žaidimui",
        button_bulk: "Pridėti kiekvienam žaidimui",
        toast_reported: "Pranešta Discord: {game}, {n} min.",
        toast_reportedAll: "Pranešta po {n} min. · žaidimų: {count}",
        toast_lowered: "Pakeista tik šiame sąraše, Discord laiko neatima",
        toast_reportFailed: "Discord žaidimo laiko pranešimo funkcija nerasta, niekas nepakeista",
        duration: "{h} val. {m} min.",
        stats_text: "Simuliuota: {time} · Žaista žaidimų: {n}",
        toast_started: "Veikia žaidimų: {n}",
        toast_stopped: "Simuliacija sustabdyta",
        toast_empty: "Pirma pridėk kelis žaidimus",
        context_add: "Pridėti {game} į MultiGamePlaytime",
        context_owned: "{game} jau yra MultiGamePlaytime",
        toast_added: "Pridėta: {game}",
        toast_alreadyAdded: "{game} jau yra tavo sąraše",
        note_share: "Nukopijuok sąrašą kaip kodą arba įklijuok draugo kodą.",
        button_copy: "Kopijuoti „{list}“",
        import_placeholder: "Įklijuok kodą, prasidedantį MGP1:",
        button_import: "Pridėti žaidimus",
        toast_copied: "Nukopijuotas kodas, žaidimų: {n}",
        toast_copyFailed: "Nepavyko nukopijuoti kodo",
        toast_listEmpty: "Šiame sąraše dar nėra žaidimų",
        toast_importInvalid: "Tai netinkamas MultiGamePlaytime kodas",
        toast_imported: "Pridėta žaidimų: {n}",
        set_checkUpdates: "Tikrinti atnaujinimus",
        note_checkUpdates: "Ieško naujos versijos „GitHub“ ir pasiūlo ją įdiegti vienu spustelėjimu.",
        notice_update: "Galima MultiGamePlaytime {version} versija.",
        button_update: "Atnaujinti",
        toast_updated: "Atnaujinta į {version}",
        toast_updateFailed: "Atnaujinti nepavyko: {error}",
    },
    nl: {
        set_active: "Games simuleren",
        note_active: "Blijft draaien na een herstart.",
        set_showPlaying: "‘Speelt’ tonen op je profiel",
        note_showPlaying: "Pakt het spel met de ster, anders het eerste. Speeltijd telt sowieso.",
        set_pauseOnReal: "Pauzeren terwijl je echt speelt",
        note_pauseOnReal: "Stopt zolang je echt iets speelt en gaat daarna verder.",
        set_panelButton: "Knop naast dempen",
        note_panelButton: "Gamepad-icoon linksonder om het aan en uit te zetten.",
        set_atOnce: "Games tegelijk",
        atOnce_all: "Alle (tot {n})",
        set_rotate: "Overschakelen naar de volgende games elke",
        note_rotate: "Doet alleen iets als je lijst meer spellen heeft dan er tegelijk draaien.",
        rotate_off: "Nooit",
        rotate_minutes: "{n} minuten",
        set_scheduleFrom: "Simuleren vanaf",
        set_scheduleTo: "Simuleren tot",
        note_schedule: "Buiten deze uren staat het op pauze. Hetzelfde uur betekent altijd.",
        hours_any: "Elk tijdstip",
        set_language: "Taal",
        language_auto: "Automatisch (taal van Discord)",
        settings_games: "Games",
        settings_share: "Lijst delen",
        settings_stats: "Statistieken",
        status_off: "Simulatie staat uit",
        status_running: "{n} games actief",
        status_pausedReal: "Gepauzeerd terwijl je {game} speelt",
        status_pausedSchedule: "Gepauzeerd tot {time}",
        list_select: "Gamelijst",
        list_main: "Mijn games",
        list_newPlaceholder: "Naam van een nieuwe lijst",
        button_newList: "Nieuwe lijst",
        button_deleteList: "Lijst verwijderen",
        toast_listExists: "Er bestaat al een lijst met deze naam",
        search_placeholder: "Zoeken in de gamelijst van Discord",
        search_none: "Geen game met deze naam in de lijst van Discord",
        database_loading: "Gamelijst van Discord laden…",
        database_failed: "De gamelijst van Discord kon niet worden geladen. Controleer je verbinding en open de instellingen opnieuw.",
        database_ready: "{n} spellen · 'gta 5' of 'fivem' werkt ook",
        hint_fivem: "telt als GTA V",
        label_noPc: "geen PC-versie",
        hint_noPc: "Discord kent geen pc-versie, telt misschien niet mee voor badges.",
        button_add: "Toevoegen",
        button_remove: "Verwijderen",
        button_random: "{n} willekeurige games toevoegen",
        button_removeAll: "Alles verwijderen",
        button_reset: "Herstellen",
        list_heading: "Je games ({n})",
        list_empty: "Nog geen spellen.",
        running: "actief",
        featured_on: "Op je profiel",
        featured_off: "Op profiel tonen",
        minutes_unit: "min",
        minutes_label: "Gespeelde minuten in {game}",
        note_minutes: "Enter slaat op. Extra minuten gaan naar Discord, minder past alleen de lijst aan.",
        bulk_label: "Minuten voor elke game",
        button_bulk: "Aan elke game toevoegen",
        toast_reported: "{n} minuten {game} gemeld aan Discord",
        toast_reportedAll: "{n} minuten gemeld voor {count} games",
        toast_lowered: "Alleen in deze lijst gewijzigd, Discord trekt geen tijd af",
        toast_reportFailed: "Speeltijdmelding van Discord niet gevonden, er is niets gewijzigd",
        duration: "{h} u {m} min",
        stats_text: "Gesimuleerd: {time} · Gespeelde games: {n}",
        toast_started: "{n} games actief",
        toast_stopped: "Simulatie gestopt",
        toast_empty: "Voeg eerst een paar spellen toe",
        context_add: "{game} toevoegen aan MultiGamePlaytime",
        context_owned: "{game} staat al in MultiGamePlaytime",
        toast_added: "{game} toegevoegd",
        toast_alreadyAdded: "{game} staat al in je lijst",
        note_share: "Kopieer je lijst als code of plak er een van een vriend.",
        button_copy: "‘{list}’ kopiëren",
        import_placeholder: "Plak een code die begint met MGP1:",
        button_import: "Games toevoegen",
        toast_copied: "Code voor {n} games gekopieerd",
        toast_copyFailed: "De code kon niet worden gekopieerd",
        toast_listEmpty: "Deze lijst heeft nog geen games",
        toast_importInvalid: "Dit is geen geldige MultiGamePlaytime-code",
        toast_imported: "{n} games toegevoegd",
        set_checkUpdates: "Zoeken naar updates",
        note_checkUpdates: "Zoekt op GitHub naar een nieuwe versie en biedt aan die met één klik te installeren.",
        notice_update: "MultiGamePlaytime {version} is beschikbaar.",
        button_update: "Bijwerken",
        toast_updated: "Bijgewerkt naar {version}",
        toast_updateFailed: "Bijwerken mislukt: {error}",
    },
    no: {
        set_active: "Simuler spill",
        note_active: "Fortsetter etter omstart.",
        set_showPlaying: "Vis «Spiller» på profilen din",
        note_showPlaying: "Bruker spillet med stjerne, ellers det første. Spilletid teller uansett.",
        set_pauseOnReal: "Sett på pause mens du spiller på ekte",
        note_pauseOnReal: "Stopper mens du faktisk spiller noe, og fortsetter etterpå.",
        set_panelButton: "Knapp ved siden av demp",
        note_panelButton: "Gamepad-ikon nede til venstre for å slå av og på.",
        set_atOnce: "Spill samtidig",
        atOnce_all: "Alle (opptil {n})",
        set_rotate: "Bytt til de neste spillene hvert",
        note_rotate: "Gjør bare noe hvis lista di har flere spill enn det som kjører samtidig.",
        rotate_off: "Aldri",
        rotate_minutes: "{n} minutter",
        set_scheduleFrom: "Simuler fra",
        set_scheduleTo: "Simuler til",
        note_schedule: "Utenfor disse timene står det på pause. Samme time betyr alltid.",
        hours_any: "Når som helst",
        set_language: "Språk",
        language_auto: "Automatisk (Discords språk)",
        settings_games: "Spill",
        settings_share: "Del liste",
        settings_stats: "Statistikk",
        status_off: "Simuleringen er av",
        status_running: "{n} spill kjører",
        status_pausedReal: "På pause mens du spiller {game}",
        status_pausedSchedule: "På pause til {time}",
        list_select: "Spilliste",
        list_main: "Mine spill",
        list_newPlaceholder: "Navn på en ny liste",
        button_newList: "Ny liste",
        button_deleteList: "Slett liste",
        toast_listExists: "Det finnes allerede en liste med dette navnet",
        search_placeholder: "Søk i Discords spilliste",
        search_none: "Ingen spill med dette navnet i Discords liste",
        database_loading: "Laster inn Discords spilliste …",
        database_failed: "Discords spilliste kunne ikke lastes inn. Sjekk tilkoblingen og åpne innstillingene på nytt.",
        database_ready: "{n} spill · «gta 5» eller «fivem» funker også",
        hint_fivem: "teller som GTA V",
        label_noPc: "ingen PC-versjon",
        hint_noPc: "Discord kjenner ingen PC-versjon, teller kanskje ikke for merker.",
        button_add: "Legg til",
        button_remove: "Fjern",
        button_random: "Legg til {n} tilfeldige spill",
        button_removeAll: "Fjern alle",
        button_reset: "Tilbakestill",
        list_heading: "Spillene dine ({n})",
        list_empty: "Ingen spill ennå.",
        running: "kjører",
        featured_on: "På profilen din",
        featured_off: "Vis på profilen",
        minutes_unit: "min",
        minutes_label: "Minutter spilt i {game}",
        note_minutes: "Enter lagrer. Flere minutter sendes til Discord, færre endrer bare lista.",
        bulk_label: "Minutter for hvert spill",
        button_bulk: "Legg til for hvert spill",
        toast_reported: "{n} minutter {game} rapportert til Discord",
        toast_reportedAll: "{n} minutter rapportert for {count} spill",
        toast_lowered: "Bare endret i denne listen, Discord trekker ikke fra tid",
        toast_reportFailed: "Fant ikke Discords rapportering av spilletid, ingenting ble endret",
        duration: "{h} t {m} min",
        stats_text: "Simulert: {time} · Spill spilt: {n}",
        toast_started: "{n} spill kjører",
        toast_stopped: "Simuleringen er stoppet",
        toast_empty: "Legg til noen spill først",
        context_add: "Legg til {game} i MultiGamePlaytime",
        context_owned: "{game} er allerede i MultiGamePlaytime",
        toast_added: "{game} lagt til",
        toast_alreadyAdded: "{game} er allerede i listen din",
        note_share: "Kopier lista som kode eller lim inn en fra en venn.",
        button_copy: "Kopier «{list}»",
        import_placeholder: "Lim inn en kode som starter med MGP1:",
        button_import: "Legg til spill",
        toast_copied: "Kode for {n} spill kopiert",
        toast_copyFailed: "Koden kunne ikke kopieres",
        toast_listEmpty: "Denne listen har ingen spill ennå",
        toast_importInvalid: "Dette er ikke en gyldig MultiGamePlaytime-kode",
        toast_imported: "{n} spill lagt til",
        set_checkUpdates: "Se etter oppdateringer",
        note_checkUpdates: "Ser etter en ny versjon på GitHub og tilbyr å installere den med ett klikk.",
        notice_update: "MultiGamePlaytime {version} er tilgjengelig.",
        button_update: "Oppdater",
        toast_updated: "Oppdatert til {version}",
        toast_updateFailed: "Oppdateringen mislyktes: {error}",
    },
    pl: {
        set_active: "Symuluj gry",
        note_active: "Działa dalej po restarcie.",
        set_showPlaying: "Pokazuj „Gra w” w profilu",
        note_showPlaying: "Bierze grę z gwiazdką, a jak jej nie ma, to pierwszą. Czas gry liczy się tak czy inaczej.",
        set_pauseOnReal: "Wstrzymuj, gdy naprawdę grasz",
        note_pauseOnReal: "Zatrzymuje się, gdy naprawdę w coś grasz, i wraca potem.",
        set_panelButton: "Przycisk obok wyciszenia",
        note_panelButton: "Ikona pada w lewym dolnym rogu do włączania i wyłączania.",
        set_atOnce: "Gry jednocześnie",
        atOnce_all: "Wszystkie (do {n})",
        set_rotate: "Przełączaj na kolejne gry co",
        note_rotate: "Ma sens tylko wtedy, gdy na liście jest więcej gier, niż działa naraz.",
        rotate_off: "Nigdy",
        rotate_minutes: "{n} min",
        set_scheduleFrom: "Symuluj od",
        set_scheduleTo: "Symuluj do",
        note_schedule: "Poza tymi godzinami jest pauza. Ta sama godzina oznacza zawsze.",
        hours_any: "Dowolna pora",
        set_language: "Język",
        language_auto: "Automatycznie (język Discorda)",
        settings_games: "Gry",
        settings_share: "Udostępnij listę",
        settings_stats: "Statystyki",
        status_off: "Symulacja jest wyłączona",
        status_running: "Uruchomione gry: {n}",
        status_pausedReal: "Wstrzymano, gdy grasz w {game}",
        status_pausedSchedule: "Wstrzymano do {time}",
        list_select: "Lista gier",
        list_main: "Moje gry",
        list_newPlaceholder: "Nazwa nowej listy",
        button_newList: "Nowa lista",
        button_deleteList: "Usuń listę",
        toast_listExists: "Lista o tej nazwie już istnieje",
        search_placeholder: "Szukaj na liście gier Discorda",
        search_none: "Brak gry o tej nazwie na liście Discorda",
        database_loading: "Wczytywanie listy gier Discorda…",
        database_failed: "Nie udało się wczytać listy gier Discorda. Sprawdź połączenie i otwórz ustawienia ponownie.",
        database_ready: "Gry: {n} · działa też „gta 5” albo „fivem”",
        hint_fivem: "liczy się jako GTA V",
        label_noPc: "brak wersji na PC",
        hint_noPc: "Discord nie zna wersji na PC, może nie liczyć się do odznak.",
        button_add: "Dodaj",
        button_remove: "Usuń",
        button_random: "Dodaj losowe gry: {n}",
        button_removeAll: "Usuń wszystkie",
        button_reset: "Resetuj",
        list_heading: "Twoje gry ({n})",
        list_empty: "Jeszcze nie ma gier.",
        running: "działa",
        featured_on: "Na twoim profilu",
        featured_off: "Pokaż na profilu",
        minutes_unit: "min",
        minutes_label: "Minuty gry w {game}",
        note_minutes: "Enter zapisuje. Dodatkowe minuty idą do Discorda, mniej zmienia tylko listę.",
        bulk_label: "Minuty dla każdej gry",
        button_bulk: "Dodaj do każdej gry",
        toast_reported: "Zgłoszono do Discorda: {game}, {n} min",
        toast_reportedAll: "Zgłoszono po {n} min · gry: {count}",
        toast_lowered: "Zmieniono tylko na tej liście, Discord nie odejmuje czasu",
        toast_reportFailed: "Nie znaleziono zgłaszania czasu gry w Discordzie, nic nie zmieniono",
        duration: "{h} godz. {m} min",
        stats_text: "Symulowano: {time} · Rozegrane gry: {n}",
        toast_started: "Uruchomione gry: {n}",
        toast_stopped: "Symulacja zatrzymana",
        toast_empty: "Najpierw dodaj kilka gier",
        context_add: "Dodaj {game} do MultiGamePlaytime",
        context_owned: "{game} jest już w MultiGamePlaytime",
        toast_added: "Dodano: {game}",
        toast_alreadyAdded: "{game} jest już na twojej liście",
        note_share: "Skopiuj listę jako kod albo wklej kod od znajomego.",
        button_copy: "Kopiuj „{list}”",
        import_placeholder: "Wklej kod zaczynający się od MGP1:",
        button_import: "Dodaj gry",
        toast_copied: "Skopiowano kod, gry: {n}",
        toast_copyFailed: "Nie udało się skopiować kodu",
        toast_listEmpty: "Ta lista nie ma jeszcze gier",
        toast_importInvalid: "To nie jest prawidłowy kod MultiGamePlaytime",
        toast_imported: "Dodano gry: {n}",
        set_checkUpdates: "Sprawdzaj aktualizacje",
        note_checkUpdates: "Szuka nowej wersji na GitHubie i proponuje instalację jednym kliknięciem.",
        notice_update: "MultiGamePlaytime {version} jest dostępny.",
        button_update: "Aktualizuj",
        toast_updated: "Zaktualizowano do {version}",
        toast_updateFailed: "Aktualizacja nie powiodła się: {error}",
    },
    "pt-BR": {
        set_active: "Simular jogos",
        note_active: "Continua depois de reiniciar.",
        set_showPlaying: "Mostrar “Jogando” no seu perfil",
        note_showPlaying: "Usa o jogo com estrela, senão o primeiro. O tempo conta de qualquer jeito.",
        set_pauseOnReal: "Pausar enquanto você joga de verdade",
        note_pauseOnReal: "Para enquanto você joga algo de verdade e volta depois.",
        set_panelButton: "Botão ao lado do mudo",
        note_panelButton: "Ícone de controle no canto inferior esquerdo para ligar e desligar.",
        set_atOnce: "Jogos ao mesmo tempo",
        atOnce_all: "Todos (até {n})",
        set_rotate: "Trocar para os próximos jogos a cada",
        note_rotate: "Só faz diferença se sua lista tiver mais jogos do que rodam ao mesmo tempo.",
        rotate_off: "Nunca",
        rotate_minutes: "{n} minutos",
        set_scheduleFrom: "Simular a partir de",
        set_scheduleTo: "Simular até",
        note_schedule: "Fora desse horário fica pausado. A mesma hora quer dizer sempre.",
        hours_any: "Qualquer hora",
        set_language: "Idioma",
        language_auto: "Automático (idioma do Discord)",
        settings_games: "Jogos",
        settings_share: "Compartilhar lista",
        settings_stats: "Estatísticas",
        status_off: "A simulação está desativada",
        status_running: "{n} jogos em execução",
        status_pausedReal: "Pausado enquanto você joga {game}",
        status_pausedSchedule: "Pausado até {time}",
        list_select: "Lista de jogos",
        list_main: "Meus jogos",
        list_newPlaceholder: "Nome de uma nova lista",
        button_newList: "Nova lista",
        button_deleteList: "Excluir lista",
        toast_listExists: "Já existe uma lista com esse nome",
        search_placeholder: "Pesquisar na lista de jogos do Discord",
        search_none: "Nenhum jogo com esse nome na lista do Discord",
        database_loading: "Carregando a lista de jogos do Discord…",
        database_failed: "Não foi possível carregar a lista de jogos do Discord. Verifique sua conexão e abra as configurações de novo.",
        database_ready: "{n} jogos · \"gta 5\" ou \"fivem\" também funciona",
        hint_fivem: "conta como GTA V",
        label_noPc: "sem versão para PC",
        hint_noPc: "O Discord não conhece versão para PC, pode não contar para as insígnias.",
        button_add: "Adicionar",
        button_remove: "Remover",
        button_random: "Adicionar {n} jogos aleatórios",
        button_removeAll: "Remover todos",
        button_reset: "Redefinir",
        list_heading: "Seus jogos ({n})",
        list_empty: "Nenhum jogo ainda.",
        running: "em execução",
        featured_on: "No seu perfil",
        featured_off: "Mostrar no perfil",
        minutes_unit: "min",
        minutes_label: "Minutos jogados em {game}",
        note_minutes: "Enter salva. Minutos a mais vão para o Discord, a menos só mudam a lista.",
        bulk_label: "Minutos para cada jogo",
        button_bulk: "Adicionar a cada jogo",
        toast_reported: "{n} minutos de {game} informados ao Discord",
        toast_reportedAll: "{n} minutos informados para {count} jogos",
        toast_lowered: "Alterado só nesta lista, o Discord não subtrai tempo",
        toast_reportFailed: "O registro de tempo de jogo do Discord não foi encontrado, nada foi alterado",
        duration: "{h} h {m} min",
        stats_text: "Simulado: {time} · Jogos jogados: {n}",
        toast_started: "{n} jogos em execução",
        toast_stopped: "Simulação parada",
        toast_empty: "Adicione alguns jogos primeiro",
        context_add: "Adicionar {game} ao MultiGamePlaytime",
        context_owned: "{game} já está no MultiGamePlaytime",
        toast_added: "{game} adicionado",
        toast_alreadyAdded: "{game} já está na sua lista",
        note_share: "Copie sua lista como código ou cole um de um amigo.",
        button_copy: "Copiar “{list}”",
        import_placeholder: "Cole um código que começa com MGP1:",
        button_import: "Adicionar jogos",
        toast_copied: "Código de {n} jogos copiado",
        toast_copyFailed: "Não foi possível copiar o código",
        toast_listEmpty: "Esta lista ainda não tem jogos",
        toast_importInvalid: "Este não é um código válido do MultiGamePlaytime",
        toast_imported: "{n} jogos adicionados",
        set_checkUpdates: "Procurar atualizações",
        note_checkUpdates: "Procura uma nova versão no GitHub e oferece instalá-la com um clique.",
        notice_update: "MultiGamePlaytime {version} está disponível.",
        button_update: "Atualizar",
        toast_updated: "Atualizado para {version}",
        toast_updateFailed: "Falha na atualização: {error}",
    },
    ro: {
        set_active: "Simulează jocuri",
        note_active: "Merge mai departe și după repornire.",
        set_showPlaying: "Afișează „Se joacă” pe profilul tău",
        note_showPlaying: "Folosește jocul cu stea, altfel primul. Timpul se numără oricum.",
        set_pauseOnReal: "Pauză cât timp joci cu adevărat",
        note_pauseOnReal: "Se oprește cât timp joci ceva de-adevăratelea și continuă după.",
        set_panelButton: "Buton lângă dezactivarea sunetului",
        note_panelButton: "Iconiță de gamepad în stânga jos pentru pornit și oprit.",
        set_atOnce: "Jocuri în același timp",
        atOnce_all: "Toate (până la {n})",
        set_rotate: "Treci la următoarele jocuri la fiecare",
        note_rotate: "Contează doar dacă lista are mai multe jocuri decât rulează deodată.",
        rotate_off: "Niciodată",
        rotate_minutes: "{n} minute",
        set_scheduleFrom: "Simulează de la",
        set_scheduleTo: "Simulează până la",
        note_schedule: "În afara acestor ore e pe pauză. Aceeași oră înseamnă mereu.",
        hours_any: "Oricând",
        set_language: "Limbă",
        language_auto: "Automat (limba Discord)",
        settings_games: "Jocuri",
        settings_share: "Distribuie lista",
        settings_stats: "Statistici",
        status_off: "Simularea e oprită",
        status_running: "Jocuri pornite: {n}",
        status_pausedReal: "Pauză cât timp joci {game}",
        status_pausedSchedule: "Pauză până la {time}",
        list_select: "Listă de jocuri",
        list_main: "Jocurile mele",
        list_newPlaceholder: "Numele unei liste noi",
        button_newList: "Listă nouă",
        button_deleteList: "Șterge lista",
        toast_listExists: "Există deja o listă cu acest nume",
        search_placeholder: "Caută în lista de jocuri Discord",
        search_none: "Niciun joc cu acest nume în lista Discord",
        database_loading: "Se încarcă lista de jocuri Discord…",
        database_failed: "Lista de jocuri Discord nu a putut fi încărcată. Verifică-ți conexiunea și redeschide setările.",
        database_ready: "Jocuri: {n} · merge și „gta 5” sau „fivem”",
        hint_fivem: "contează ca GTA V",
        label_noPc: "fără versiune de PC",
        hint_noPc: "Discord nu știe de o versiune PC, s-ar putea să nu conteze pentru insigne.",
        button_add: "Adaugă",
        button_remove: "Elimină",
        button_random: "Adaugă jocuri aleatorii: {n}",
        button_removeAll: "Elimină toate",
        button_reset: "Resetează",
        list_heading: "Jocurile tale ({n})",
        list_empty: "Încă nu ai jocuri.",
        running: "rulează",
        featured_on: "Pe profilul tău",
        featured_off: "Arată pe profil",
        minutes_unit: "min",
        minutes_label: "Minute jucate în {game}",
        note_minutes: "Enter salvează. Minutele în plus merg la Discord, mai puține schimbă doar lista.",
        bulk_label: "Minute pentru fiecare joc",
        button_bulk: "Adaugă la fiecare joc",
        toast_reported: "Raportat către Discord: {game}, {n} min",
        toast_reportedAll: "Raportat câte {n} min · jocuri: {count}",
        toast_lowered: "Modificat doar în această listă, Discord nu scade timp",
        toast_reportFailed: "Raportarea timpului de joc din Discord nu a fost găsită, nu s-a schimbat nimic",
        duration: "{h} h {m} min",
        stats_text: "Simulat: {time} · Jocuri jucate: {n}",
        toast_started: "Jocuri pornite: {n}",
        toast_stopped: "Simulare oprită",
        toast_empty: "Adaugă întâi câteva jocuri",
        context_add: "Adaugă {game} în MultiGamePlaytime",
        context_owned: "{game} e deja în MultiGamePlaytime",
        toast_added: "{game} a fost adăugat",
        toast_alreadyAdded: "{game} e deja în lista ta",
        note_share: "Copiază lista ca cod sau lipește codul unui prieten.",
        button_copy: "Copiază „{list}”",
        import_placeholder: "Lipește un cod care începe cu MGP1:",
        button_import: "Adaugă jocuri",
        toast_copied: "Cod copiat, jocuri: {n}",
        toast_copyFailed: "Codul nu a putut fi copiat",
        toast_listEmpty: "Această listă nu are încă jocuri",
        toast_importInvalid: "Acesta nu e un cod MultiGamePlaytime valid",
        toast_imported: "Jocuri adăugate: {n}",
        set_checkUpdates: "Caută actualizări",
        note_checkUpdates: "Caută o versiune nouă pe GitHub și oferă instalarea cu un singur clic.",
        notice_update: "MultiGamePlaytime {version} este disponibil.",
        button_update: "Actualizează",
        toast_updated: "Actualizat la {version}",
        toast_updateFailed: "Actualizarea a eșuat: {error}",
    },
    ru: {
        set_active: "Симулировать игры",
        note_active: "Продолжает работать после перезапуска.",
        set_showPlaying: "Показывать «Играет в» в профиле",
        note_showPlaying: "Берёт игру со звёздочкой, иначе первую. Время засчитывается в любом случае.",
        set_pauseOnReal: "Пауза, пока вы действительно играете",
        note_pauseOnReal: "Останавливается, пока вы правда во что-то играете, и потом продолжает.",
        set_panelButton: "Кнопка рядом с отключением микрофона",
        note_panelButton: "Значок геймпада слева внизу, чтобы включать и выключать.",
        set_atOnce: "Игр одновременно",
        atOnce_all: "Все (до {n})",
        set_rotate: "Переключаться на следующие игры каждые",
        note_rotate: "Имеет смысл, только если в списке больше игр, чем запускается одновременно.",
        rotate_off: "Никогда",
        rotate_minutes: "{n} мин",
        set_scheduleFrom: "Симулировать с",
        set_scheduleTo: "Симулировать до",
        note_schedule: "Вне этих часов стоит на паузе. Одинаковый час значит всегда.",
        hours_any: "В любое время",
        set_language: "Язык",
        language_auto: "Автоматически (язык Discord)",
        settings_games: "Игры",
        settings_share: "Поделиться списком",
        settings_stats: "Статистика",
        status_off: "Симуляция выключена",
        status_running: "Запущено игр: {n}",
        status_pausedReal: "Пауза, пока вы играете в {game}",
        status_pausedSchedule: "Пауза до {time}",
        list_select: "Список игр",
        list_main: "Мои игры",
        list_newPlaceholder: "Название нового списка",
        button_newList: "Новый список",
        button_deleteList: "Удалить список",
        toast_listExists: "Список с таким названием уже есть",
        search_placeholder: "Поиск по списку игр Discord",
        search_none: "В списке Discord нет игры с таким названием",
        database_loading: "Загрузка списка игр Discord…",
        database_failed: "Не удалось загрузить список игр Discord. Проверьте подключение и откройте настройки снова.",
        database_ready: "Игр: {n} · можно и «gta 5» или «fivem»",
        hint_fivem: "считается как GTA V",
        label_noPc: "нет версии для PC",
        hint_noPc: "Discord не знает версию для PC, может не засчитаться в значки.",
        button_add: "Добавить",
        button_remove: "Удалить",
        button_random: "Добавить случайные игры: {n}",
        button_removeAll: "Удалить все",
        button_reset: "Сбросить",
        list_heading: "Ваши игры ({n})",
        list_empty: "Игр пока нет.",
        running: "запущена",
        featured_on: "В вашем профиле",
        featured_off: "Показывать в профиле",
        minutes_unit: "мин",
        minutes_label: "Минуты в игре {game}",
        note_minutes: "Enter сохраняет. Добавленные минуты уходят в Discord, уменьшение меняет только список.",
        bulk_label: "Минуты для каждой игры",
        button_bulk: "Добавить каждой игре",
        toast_reported: "Отправлено в Discord: {game}, {n} мин",
        toast_reportedAll: "Отправлено по {n} мин · игр: {count}",
        toast_lowered: "Изменено только в этом списке, Discord не вычитает время",
        toast_reportFailed: "Отправка игрового времени в Discord не найдена, ничего не изменено",
        duration: "{h} ч {m} мин",
        stats_text: "Симулировано: {time} · Сыграно игр: {n}",
        toast_started: "Запущено игр: {n}",
        toast_stopped: "Симуляция остановлена",
        toast_empty: "Сначала добавьте пару игр",
        context_add: "Добавить {game} в MultiGamePlaytime",
        context_owned: "{game} уже есть в MultiGamePlaytime",
        toast_added: "Добавлено: {game}",
        toast_alreadyAdded: "{game} уже есть в вашем списке",
        note_share: "Скопируйте список как код или вставьте код друга.",
        button_copy: "Копировать «{list}»",
        import_placeholder: "Вставьте код, начинающийся с MGP1:",
        button_import: "Добавить игры",
        toast_copied: "Код скопирован, игр: {n}",
        toast_copyFailed: "Не удалось скопировать код",
        toast_listEmpty: "В этом списке пока нет игр",
        toast_importInvalid: "Это недействительный код MultiGamePlaytime",
        toast_imported: "Добавлено игр: {n}",
        set_checkUpdates: "Проверять обновления",
        note_checkUpdates: "Ищет новую версию на GitHub и предлагает установить её одним щелчком.",
        notice_update: "Доступна версия MultiGamePlaytime {version}.",
        button_update: "Обновить",
        toast_updated: "Обновлено до {version}",
        toast_updateFailed: "Не удалось обновить: {error}",
    },
    "sv-SE": {
        set_active: "Simulera spel",
        note_active: "Fortsätter efter en omstart.",
        set_showPlaying: "Visa ”Spelar” på din profil",
        note_showPlaying: "Använder spelet med stjärna, annars det första. Speltiden räknas ändå.",
        set_pauseOnReal: "Pausa medan du verkligen spelar",
        note_pauseOnReal: "Stannar medan du faktiskt spelar något och fortsätter efteråt.",
        set_panelButton: "Knapp bredvid tysta",
        note_panelButton: "Handkontrollsikon nere till vänster för att slå av och på.",
        set_atOnce: "Spel samtidigt",
        atOnce_all: "Alla (upp till {n})",
        set_rotate: "Byt till nästa spel var",
        note_rotate: "Gör bara något om din lista har fler spel än det som körs samtidigt.",
        rotate_off: "Aldrig",
        rotate_minutes: "{n} minut",
        set_scheduleFrom: "Simulera från",
        set_scheduleTo: "Simulera till",
        note_schedule: "Utanför de här timmarna pausas det. Samma timme betyder alltid.",
        hours_any: "När som helst",
        set_language: "Språk",
        language_auto: "Automatiskt (Discords språk)",
        settings_games: "Spel",
        settings_share: "Dela lista",
        settings_stats: "Statistik",
        status_off: "Simuleringen är av",
        status_running: "{n} spel körs",
        status_pausedReal: "Pausad medan du spelar {game}",
        status_pausedSchedule: "Pausad till {time}",
        list_select: "Spellista",
        list_main: "Mina spel",
        list_newPlaceholder: "Namn på en ny lista",
        button_newList: "Ny lista",
        button_deleteList: "Radera lista",
        toast_listExists: "Det finns redan en lista med det här namnet",
        search_placeholder: "Sök i Discords spellista",
        search_none: "Inget spel med det här namnet i Discords lista",
        database_loading: "Läser in Discords spellista…",
        database_failed: "Discords spellista kunde inte läsas in. Kontrollera din anslutning och öppna inställningarna igen.",
        database_ready: "{n} spel · ”gta 5” eller ”fivem” funkar också",
        hint_fivem: "räknas som GTA V",
        label_noPc: "ingen PC-version",
        hint_noPc: "Discord känner inte till någon PC-version, räknas kanske inte till märken.",
        button_add: "Lägg till",
        button_remove: "Ta bort",
        button_random: "Lägg till {n} slumpmässiga spel",
        button_removeAll: "Ta bort alla",
        button_reset: "Återställ",
        list_heading: "Dina spel ({n})",
        list_empty: "Inga spel än.",
        running: "körs",
        featured_on: "På din profil",
        featured_off: "Visa på profilen",
        minutes_unit: "min",
        minutes_label: "Spelade minuter i {game}",
        note_minutes: "Enter sparar. Fler minuter skickas till Discord, färre ändrar bara listan.",
        bulk_label: "Minuter för varje spel",
        button_bulk: "Lägg till för varje spel",
        toast_reported: "{n} minuter av {game} rapporterade till Discord",
        toast_reportedAll: "{n} minuter rapporterade för {count} spel",
        toast_lowered: "Ändrat bara i den här listan, Discord drar inte av tid",
        toast_reportFailed: "Discords rapportering av speltid hittades inte, inget ändrades",
        duration: "{h} tim {m} min",
        stats_text: "Simulerat: {time} · Spelade spel: {n}",
        toast_started: "{n} spel körs",
        toast_stopped: "Simuleringen har stoppats",
        toast_empty: "Lägg till några spel först",
        context_add: "Lägg till {game} i MultiGamePlaytime",
        context_owned: "{game} finns redan i MultiGamePlaytime",
        toast_added: "{game} har lagts till",
        toast_alreadyAdded: "{game} finns redan i din lista",
        note_share: "Kopiera listan som kod eller klistra in en från en vän.",
        button_copy: "Kopiera ”{list}”",
        import_placeholder: "Klistra in en kod som börjar med MGP1:",
        button_import: "Lägg till spel",
        toast_copied: "Kod för {n} spel kopierad",
        toast_copyFailed: "Koden kunde inte kopieras",
        toast_listEmpty: "Den här listan har inga spel än",
        toast_importInvalid: "Det här är ingen giltig MultiGamePlaytime-kod",
        toast_imported: "{n} spel har lagts till",
        set_checkUpdates: "Sök efter uppdateringar",
        note_checkUpdates: "Söker efter en ny version på GitHub och erbjuder installation med ett klick.",
        notice_update: "MultiGamePlaytime {version} finns tillgänglig.",
        button_update: "Uppdatera",
        toast_updated: "Uppdaterad till {version}",
        toast_updateFailed: "Uppdateringen misslyckades: {error}",
    },
    th: {
        set_active: "จำลองเกม",
        note_active: "ทำงานต่อหลังรีสตาร์ท",
        set_showPlaying: "แสดง \"กำลังเล่น\" บนโปรไฟล์",
        note_showPlaying: "ใช้เกมที่ติดดาว ถ้าไม่มีก็เกมแรก เวลาเล่นนับเหมือนเดิม",
        set_pauseOnReal: "หยุดชั่วคราวขณะที่คุณเล่นจริง",
        note_pauseOnReal: "หยุดตอนที่คุณเล่นเกมจริง แล้วทำต่อหลังจากนั้น",
        set_panelButton: "ปุ่มข้างปุ่มปิดเสียง",
        note_panelButton: "ไอคอนจอยมุมซ้ายล่างสำหรับเปิดและปิด",
        set_atOnce: "จำนวนเกมพร้อมกัน",
        atOnce_all: "ทั้งหมด (สูงสุด {n})",
        set_rotate: "สลับไปเกมถัดไปทุก",
        note_rotate: "มีผลก็ต่อเมื่อในรายการมีเกมมากกว่าจำนวนที่รันพร้อมกัน",
        rotate_off: "ไม่เลย",
        rotate_minutes: "{n} นาที",
        set_scheduleFrom: "จำลองตั้งแต่",
        set_scheduleTo: "จำลองจนถึง",
        note_schedule: "นอกช่วงเวลานี้จะหยุดพัก ชั่วโมงเดียวกันหมายถึงตลอดเวลา",
        hours_any: "เวลาใดก็ได้",
        set_language: "ภาษา",
        language_auto: "อัตโนมัติ (ภาษาของ Discord)",
        settings_games: "เกม",
        settings_share: "แชร์รายการ",
        settings_stats: "สถิติ",
        status_off: "การจำลองปิดอยู่",
        status_running: "เกมกำลังทำงาน {n} เกม",
        status_pausedReal: "หยุดชั่วคราวขณะที่คุณเล่น {game}",
        status_pausedSchedule: "หยุดชั่วคราวจนถึง {time}",
        list_select: "รายการเกม",
        list_main: "เกมของฉัน",
        list_newPlaceholder: "ชื่อรายการใหม่",
        button_newList: "รายการใหม่",
        button_deleteList: "ลบรายการ",
        toast_listExists: "มีรายการชื่อนี้อยู่แล้ว",
        search_placeholder: "ค้นหาในรายการเกมของ Discord",
        search_none: "ไม่มีเกมชื่อนี้ในรายการของ Discord",
        database_loading: "กำลังโหลดรายการเกมของ Discord…",
        database_failed: "โหลดรายการเกมของ Discord ไม่ได้ ตรวจสอบการเชื่อมต่อแล้วเปิดการตั้งค่าอีกครั้ง",
        database_ready: "{n} เกม · ค้นหา \"gta 5\" หรือ \"fivem\" ก็ได้",
        hint_fivem: "นับเป็น GTA V",
        label_noPc: "ไม่มีเวอร์ชัน PC",
        hint_noPc: "Discord ไม่รู้จักเวอร์ชัน PC อาจไม่นับในเหรียญตรา",
        button_add: "เพิ่ม",
        button_remove: "ลบ",
        button_random: "เพิ่มเกมแบบสุ่ม {n} เกม",
        button_removeAll: "ลบทั้งหมด",
        button_reset: "รีเซ็ต",
        list_heading: "เกมของคุณ ({n})",
        list_empty: "ยังไม่มีเกม",
        running: "กำลังทำงาน",
        featured_on: "แสดงในโปรไฟล์อยู่",
        featured_off: "แสดงในโปรไฟล์",
        minutes_unit: "นาที",
        minutes_label: "นาทีที่เล่น {game}",
        note_minutes: "กด Enter เพื่อบันทึก นาทีที่เพิ่มจะส่งไป Discord ส่วนการลดจะเปลี่ยนแค่รายการ",
        bulk_label: "จำนวนนาทีสำหรับทุกเกม",
        button_bulk: "เพิ่มให้ทุกเกม",
        toast_reported: "รายงาน {game} {n} นาทีไปยัง Discord แล้ว",
        toast_reportedAll: "รายงาน {n} นาทีสำหรับ {count} เกมแล้ว",
        toast_lowered: "เปลี่ยนเฉพาะในรายการนี้ Discord จะไม่หักเวลาออก",
        toast_reportFailed: "ไม่พบการรายงานเวลาเล่นของ Discord จึงไม่มีการเปลี่ยนแปลง",
        duration: "{h} ชม. {m} นาที",
        stats_text: "จำลองแล้ว: {time} · เกมที่เล่น: {n}",
        toast_started: "เกมกำลังทำงาน {n} เกม",
        toast_stopped: "หยุดการจำลองแล้ว",
        toast_empty: "เพิ่มเกมก่อนสักหน่อย",
        context_add: "เพิ่ม {game} ไปยัง MultiGamePlaytime",
        context_owned: "{game} อยู่ใน MultiGamePlaytime แล้ว",
        toast_added: "เพิ่ม {game} แล้ว",
        toast_alreadyAdded: "{game} อยู่ในรายการของคุณแล้ว",
        note_share: "คัดลอกรายการเป็นโค้ด หรือวางโค้ดจากเพื่อน",
        button_copy: "คัดลอก \"{list}\"",
        import_placeholder: "วางโค้ดที่ขึ้นต้นด้วย MGP1:",
        button_import: "เพิ่มเกม",
        toast_copied: "คัดลอกโค้ดของ {n} เกมแล้ว",
        toast_copyFailed: "คัดลอกโค้ดไม่ได้",
        toast_listEmpty: "รายการนี้ยังไม่มีเกม",
        toast_importInvalid: "นี่ไม่ใช่โค้ด MultiGamePlaytime ที่ถูกต้อง",
        toast_imported: "เพิ่ม {n} เกมแล้ว",
        set_checkUpdates: "ตรวจหาอัปเดต",
        note_checkUpdates: "ค้นหาเวอร์ชันใหม่บน GitHub และเสนอให้ติดตั้งด้วยการคลิกเดียว",
        notice_update: "MultiGamePlaytime {version} พร้อมใช้งานแล้ว",
        button_update: "อัปเดต",
        toast_updated: "อัปเดตเป็น {version} แล้ว",
        toast_updateFailed: "อัปเดตไม่สำเร็จ: {error}",
    },
    tr: {
        set_active: "Oyunları simüle et",
        note_active: "Yeniden başlatmadan sonra da çalışır.",
        set_showPlaying: "Profilinde \"Oynuyor\" göster",
        note_showPlaying: "Yıldızlı oyunu, yoksa ilkini kullanır. Oyun süresi her türlü sayılır.",
        set_pauseOnReal: "Gerçekten oynarken duraklat",
        note_pauseOnReal: "Gerçekten bir şey oynarken durur, sonra devam eder.",
        set_panelButton: "Sesi kapat düğmesinin yanında",
        note_panelButton: "Açıp kapatmak için sol altta oyun kolu simgesi.",
        set_atOnce: "Aynı anda çalışan oyunlar",
        atOnce_all: "Tümü ({n} oyuna kadar)",
        set_rotate: "Sonraki oyunlara geçiş sıklığı",
        note_rotate: "Sadece listende aynı anda çalışandan fazla oyun varsa işe yarar.",
        rotate_off: "Asla",
        rotate_minutes: "{n} dakika",
        set_scheduleFrom: "Simülasyon başlangıcı",
        set_scheduleTo: "Simülasyon bitişi",
        note_schedule: "Bu saatlerin dışında duraklar. Aynı saat her zaman demek.",
        hours_any: "Herhangi bir saat",
        set_language: "Dil",
        language_auto: "Otomatik (Discord dili)",
        settings_games: "Oyunlar",
        settings_share: "Listeyi paylaş",
        settings_stats: "İstatistikler",
        status_off: "Simülasyon kapalı",
        status_running: "{n} oyun çalışıyor",
        status_pausedReal: "{game} oynarken duraklatıldı",
        status_pausedSchedule: "Duraklatıldı, devam saati: {time}",
        list_select: "Oyun listesi",
        list_main: "Oyunlarım",
        list_newPlaceholder: "Yeni listenin adı",
        button_newList: "Yeni liste",
        button_deleteList: "Listeyi sil",
        toast_listExists: "Bu adda bir liste zaten var",
        search_placeholder: "Discord'un oyun listesinde ara",
        search_none: "Discord'un listesinde bu adda bir oyun yok",
        database_loading: "Discord'un oyun listesi yükleniyor…",
        database_failed: "Discord'un oyun listesi yüklenemedi. Bağlantını kontrol et ve ayarları yeniden aç.",
        database_ready: "{n} oyun · \"gta 5\" ya da \"fivem\" de olur",
        hint_fivem: "GTA V olarak sayılır",
        label_noPc: "PC sürümü yok",
        hint_noPc: "Discord bir PC sürümü bilmiyor, rozetlere sayılmayabilir.",
        button_add: "Ekle",
        button_remove: "Kaldır",
        button_random: "{n} rastgele oyun ekle",
        button_removeAll: "Tümünü kaldır",
        button_reset: "Sıfırla",
        list_heading: "Oyunların ({n})",
        list_empty: "Henüz oyun yok.",
        running: "çalışıyor",
        featured_on: "Profilinde",
        featured_off: "Profilde göster",
        minutes_unit: "dk",
        minutes_label: "{game} için oynanan dakikalar",
        note_minutes: "Enter kaydeder. Fazla dakikalar Discord'a gider, azaltmak sadece listeyi değiştirir.",
        bulk_label: "Her oyun için dakika",
        button_bulk: "Her oyuna ekle",
        toast_reported: "{game} için {n} dakika Discord'a bildirildi",
        toast_reportedAll: "{count} oyun için {n} dakika bildirildi",
        toast_lowered: "Yalnızca bu listede değişti, Discord süreyi geri almaz",
        toast_reportFailed: "Discord'un oynama süresi bildirimi bulunamadı, hiçbir şey değişmedi",
        duration: "{h} sa {m} dk",
        stats_text: "Simüle edilen: {time} · Oynanan oyunlar: {n}",
        toast_started: "{n} oyun çalışıyor",
        toast_stopped: "Simülasyon durduruldu",
        toast_empty: "Önce birkaç oyun ekle",
        context_add: "{game} oyununu MultiGamePlaytime'a ekle",
        context_owned: "{game} zaten MultiGamePlaytime'da",
        toast_added: "{game} eklendi",
        toast_alreadyAdded: "{game} zaten listende",
        note_share: "Listeni kod olarak kopyala ya da bir arkadaşının kodunu yapıştır.",
        button_copy: "\"{list}\" listesini kopyala",
        import_placeholder: "MGP1: ile başlayan bir kod yapıştır",
        button_import: "Oyunları ekle",
        toast_copied: "{n} oyunun kodu kopyalandı",
        toast_copyFailed: "Kod kopyalanamadı",
        toast_listEmpty: "Bu listede henüz oyun yok",
        toast_importInvalid: "Bu geçerli bir MultiGamePlaytime kodu değil",
        toast_imported: "{n} oyun eklendi",
        set_checkUpdates: "Güncellemeleri denetle",
        note_checkUpdates: "GitHub'da yeni sürüm arar ve tek tıkla yüklemeyi önerir.",
        notice_update: "MultiGamePlaytime {version} kullanılabilir.",
        button_update: "Güncelle",
        toast_updated: "{version} sürümüne güncellendi",
        toast_updateFailed: "Güncelleme başarısız: {error}",
    },
    uk: {
        set_active: "Симулювати ігри",
        note_active: "Працює далі після перезапуску.",
        set_showPlaying: "Показувати «Грає» у профілі",
        note_showPlaying: "Бере гру із зірочкою, інакше першу. Час зараховується в будь-якому разі.",
        set_pauseOnReal: "Призупиняти, коли ви справді граєте",
        note_pauseOnReal: "Зупиняється, поки ви справді у щось граєте, і потім продовжує.",
        set_panelButton: "Кнопка біля вимкнення мікрофона",
        note_panelButton: "Значок геймпада ліворуч унизу, щоб вмикати й вимикати.",
        set_atOnce: "Ігор одночасно",
        atOnce_all: "Усі (до {n})",
        set_rotate: "Перемикати на наступні ігри кожні",
        note_rotate: "Має сенс, лише якщо у списку більше ігор, ніж запускається одночасно.",
        rotate_off: "Ніколи",
        rotate_minutes: "{n} хв",
        set_scheduleFrom: "Симулювати з",
        set_scheduleTo: "Симулювати до",
        note_schedule: "Поза цими годинами на паузі. Однакова година означає завжди.",
        hours_any: "Будь-коли",
        set_language: "Мова",
        language_auto: "Автоматично (мова Discord)",
        settings_games: "Ігри",
        settings_share: "Поділитися списком",
        settings_stats: "Статистика",
        status_off: "Симуляцію вимкнено",
        status_running: "Запущено ігор: {n}",
        status_pausedReal: "Призупинено, поки ви граєте в {game}",
        status_pausedSchedule: "Призупинено до {time}",
        list_select: "Список ігор",
        list_main: "Мої ігри",
        list_newPlaceholder: "Назва нового списку",
        button_newList: "Новий список",
        button_deleteList: "Видалити список",
        toast_listExists: "Список із такою назвою вже існує",
        search_placeholder: "Пошук у списку ігор Discord",
        search_none: "У списку Discord немає гри з такою назвою",
        database_loading: "Завантаження списку ігор Discord…",
        database_failed: "Не вдалося завантажити список ігор Discord. Перевірте з’єднання та відкрийте налаштування знову.",
        database_ready: "Ігор: {n} · можна й «gta 5» чи «fivem»",
        hint_fivem: "зараховується як GTA V",
        label_noPc: "немає версії для PC",
        hint_noPc: "Discord не знає версії для PC, може не зарахуватися до значків.",
        button_add: "Додати",
        button_remove: "Видалити",
        button_random: "Додати випадкові ігри ({n})",
        button_removeAll: "Видалити всі",
        button_reset: "Скинути",
        list_heading: "Ваші ігри ({n})",
        list_empty: "Ігор поки немає.",
        running: "запущено",
        featured_on: "У вашому профілі",
        featured_off: "Показувати в профілі",
        minutes_unit: "хв",
        minutes_label: "Зіграні хвилини в {game}",
        note_minutes: "Enter зберігає. Додані хвилини йдуть у Discord, зменшення змінює лише список.",
        bulk_label: "Хвилини для кожної гри",
        button_bulk: "Додати до кожної гри",
        toast_reported: "{n} хв гри {game} передано в Discord",
        toast_reportedAll: "Передано {n} хв, ігор: {count}",
        toast_lowered: "Змінено лише в цьому списку, Discord не віднімає час",
        toast_reportFailed: "Не знайдено передавання часу гри в Discord, нічого не змінено",
        duration: "{h} год {m} хв",
        stats_text: "Симульовано: {time} · Зіграно ігор: {n}",
        toast_started: "Запущено ігор: {n}",
        toast_stopped: "Симуляцію зупинено",
        toast_empty: "Спершу додайте кілька ігор",
        context_add: "Додати {game} до MultiGamePlaytime",
        context_owned: "{game} вже є в MultiGamePlaytime",
        toast_added: "Додано {game}",
        toast_alreadyAdded: "{game} вже є у вашому списку",
        note_share: "Скопіюйте список як код або вставте код друга.",
        button_copy: "Копіювати «{list}»",
        import_placeholder: "Вставте код, що починається з MGP1:",
        button_import: "Додати ігри",
        toast_copied: "Код скопійовано, ігор: {n}",
        toast_copyFailed: "Не вдалося скопіювати код",
        toast_listEmpty: "У цьому списку ще немає ігор",
        toast_importInvalid: "Це не дійсний код MultiGamePlaytime",
        toast_imported: "Додано ігор: {n}",
        set_checkUpdates: "Перевіряти оновлення",
        note_checkUpdates: "Шукає нову версію на GitHub і пропонує встановити її одним клацанням.",
        notice_update: "Доступна версія MultiGamePlaytime {version}.",
        button_update: "Оновити",
        toast_updated: "Оновлено до {version}",
        toast_updateFailed: "Не вдалося оновити: {error}",
    },
    vi: {
        set_active: "Giả lập trò chơi",
        note_active: "Vẫn chạy sau khi khởi động lại.",
        set_showPlaying: "Hiển thị \"Đang chơi\" trên hồ sơ",
        note_showPlaying: "Dùng game có sao, không thì game đầu tiên. Thời gian chơi vẫn được tính.",
        set_pauseOnReal: "Tạm dừng khi bạn chơi thật",
        note_pauseOnReal: "Dừng khi bạn đang chơi thật và chạy lại sau đó.",
        set_panelButton: "Nút cạnh tắt tiếng",
        note_panelButton: "Biểu tượng tay cầm ở góc dưới bên trái để bật và tắt.",
        set_atOnce: "Số trò chơi cùng lúc",
        atOnce_all: "Tất cả (tối đa {n})",
        set_rotate: "Chuyển sang trò chơi tiếp theo mỗi",
        note_rotate: "Chỉ có tác dụng khi danh sách có nhiều game hơn số chạy cùng lúc.",
        rotate_off: "Không bao giờ",
        rotate_minutes: "{n} phút",
        set_scheduleFrom: "Giả lập từ",
        set_scheduleTo: "Giả lập đến",
        note_schedule: "Ngoài các giờ này sẽ tạm dừng. Cùng giờ nghĩa là luôn luôn.",
        hours_any: "Bất kỳ lúc nào",
        set_language: "Ngôn ngữ",
        language_auto: "Tự động (ngôn ngữ của Discord)",
        settings_games: "Trò chơi",
        settings_share: "Chia sẻ danh sách",
        settings_stats: "Thống kê",
        status_off: "Giả lập đang tắt",
        status_running: "{n} trò chơi đang chạy",
        status_pausedReal: "Tạm dừng khi bạn chơi {game}",
        status_pausedSchedule: "Tạm dừng đến {time}",
        list_select: "Danh sách trò chơi",
        list_main: "Trò chơi của tôi",
        list_newPlaceholder: "Tên danh sách mới",
        button_newList: "Danh sách mới",
        button_deleteList: "Xóa danh sách",
        toast_listExists: "Đã có danh sách với tên này",
        search_placeholder: "Tìm trong danh sách trò chơi của Discord",
        search_none: "Không có trò chơi nào với tên này trong danh sách của Discord",
        database_loading: "Đang tải danh sách trò chơi của Discord…",
        database_failed: "Không thể tải danh sách trò chơi của Discord. Hãy kiểm tra kết nối và mở lại cài đặt.",
        database_ready: "{n} game · tìm \"gta 5\" hay \"fivem\" cũng được",
        hint_fivem: "được tính là GTA V",
        label_noPc: "không có bản PC",
        hint_noPc: "Discord không biết bản PC, có thể không được tính cho huy hiệu.",
        button_add: "Thêm",
        button_remove: "Xóa",
        button_random: "Thêm {n} trò chơi ngẫu nhiên",
        button_removeAll: "Xóa tất cả",
        button_reset: "Đặt lại",
        list_heading: "Trò chơi của bạn ({n})",
        list_empty: "Chưa có game nào.",
        running: "đang chạy",
        featured_on: "Trên hồ sơ của bạn",
        featured_off: "Hiện trên hồ sơ",
        minutes_unit: "phút",
        minutes_label: "Số phút đã chơi {game}",
        note_minutes: "Enter để lưu. Phút thêm được gửi tới Discord, giảm thì chỉ đổi danh sách.",
        bulk_label: "Số phút cho mỗi trò chơi",
        button_bulk: "Thêm vào mọi trò chơi",
        toast_reported: "Đã báo {n} phút chơi {game} cho Discord",
        toast_reportedAll: "Đã báo {n} phút cho {count} trò chơi",
        toast_lowered: "Chỉ thay đổi trong danh sách này, Discord không trừ thời gian",
        toast_reportFailed: "Không tìm thấy chức năng báo thời gian chơi của Discord, không có gì thay đổi",
        duration: "{h} giờ {m} phút",
        stats_text: "Đã giả lập: {time} · Trò chơi đã chơi: {n}",
        toast_started: "{n} trò chơi đang chạy",
        toast_stopped: "Đã dừng giả lập",
        toast_empty: "Thêm vài game trước đã",
        context_add: "Thêm {game} vào MultiGamePlaytime",
        context_owned: "{game} đã có trong MultiGamePlaytime",
        toast_added: "Đã thêm {game}",
        toast_alreadyAdded: "{game} đã có trong danh sách của bạn",
        note_share: "Sao chép danh sách thành mã hoặc dán mã của bạn bè.",
        button_copy: "Sao chép \"{list}\"",
        import_placeholder: "Dán mã bắt đầu bằng MGP1:",
        button_import: "Thêm trò chơi",
        toast_copied: "Đã sao chép mã cho {n} trò chơi",
        toast_copyFailed: "Không thể sao chép mã",
        toast_listEmpty: "Danh sách này chưa có trò chơi nào",
        toast_importInvalid: "Đây không phải mã MultiGamePlaytime hợp lệ",
        toast_imported: "Đã thêm {n} trò chơi",
        set_checkUpdates: "Kiểm tra cập nhật",
        note_checkUpdates: "Tìm phiên bản mới trên GitHub và đề nghị cài đặt chỉ với một cú nhấp.",
        notice_update: "MultiGamePlaytime {version} đã có.",
        button_update: "Cập nhật",
        toast_updated: "Đã cập nhật lên {version}",
        toast_updateFailed: "Cập nhật thất bại: {error}",
    },
    "zh-CN": {
        set_active: "模拟游戏",
        note_active: "重启后继续运行。",
        set_showPlaying: "在个人资料上显示“正在玩”",
        note_showPlaying: "使用加星的游戏，没有就用第一个。游戏时长照样累计。",
        set_pauseOnReal: "真正玩游戏时暂停",
        note_pauseOnReal: "你真的在玩游戏时暂停，结束后继续。",
        set_panelButton: "静音旁边的按钮",
        note_panelButton: "左下角的手柄图标，用来开关。",
        set_atOnce: "同时运行的游戏",
        atOnce_all: "全部（最多 {n} 款）",
        set_rotate: "切换到下一批游戏的间隔",
        note_rotate: "只有列表里的游戏比同时运行的多时才有用。",
        rotate_off: "从不",
        rotate_minutes: "{n} 分钟",
        set_scheduleFrom: "模拟开始时间",
        set_scheduleTo: "模拟结束时间",
        note_schedule: "这个时段外会暂停。同一小时表示一直运行。",
        hours_any: "任意时间",
        set_language: "语言",
        language_auto: "自动（Discord 语言）",
        settings_games: "游戏",
        settings_share: "分享列表",
        settings_stats: "统计",
        status_off: "模拟已关闭",
        status_running: "{n} 款游戏正在运行",
        status_pausedReal: "你正在玩 {game}，已暂停",
        status_pausedSchedule: "已暂停至 {time}",
        list_select: "游戏列表",
        list_main: "我的游戏",
        list_newPlaceholder: "新列表的名称",
        button_newList: "新建列表",
        button_deleteList: "删除列表",
        toast_listExists: "已存在同名列表",
        search_placeholder: "搜索 Discord 的游戏列表",
        search_none: "Discord 的列表中没有此名称的游戏",
        database_loading: "正在加载 Discord 的游戏列表…",
        database_failed: "无法加载 Discord 的游戏列表。请检查网络连接，然后重新打开设置。",
        database_ready: "{n} 款游戏 · 也可以搜“gta 5”或“fivem”",
        hint_fivem: "计为 GTA V",
        label_noPc: "无 PC 版本",
        hint_noPc: "Discord 没有它的 PC 版信息，可能不计入徽章。",
        button_add: "添加",
        button_remove: "移除",
        button_random: "添加 {n} 款随机游戏",
        button_removeAll: "全部移除",
        button_reset: "重置",
        list_heading: "你的游戏（{n}）",
        list_empty: "还没有游戏。",
        running: "运行中",
        featured_on: "已在个人资料中显示",
        featured_off: "在个人资料中显示",
        minutes_unit: "分钟",
        minutes_label: "{game} 的已玩分钟数",
        note_minutes: "按回车保存。增加的分钟会发给 Discord，减少只改列表。",
        bulk_label: "每款游戏的分钟数",
        button_bulk: "添加到每款游戏",
        toast_reported: "已向 Discord 上报 {game} 的 {n} 分钟",
        toast_reportedAll: "已为 {count} 款游戏上报 {n} 分钟",
        toast_lowered: "仅在此列表中修改，Discord 不会扣减时间",
        toast_reportFailed: "未找到 Discord 的游戏时长上报功能，未做任何更改",
        duration: "{h} 小时 {m} 分钟",
        stats_text: "已模拟：{time} · 已玩游戏：{n}",
        toast_started: "{n} 款游戏正在运行",
        toast_stopped: "模拟已停止",
        toast_empty: "请先添加几个游戏",
        context_add: "将 {game} 添加到 MultiGamePlaytime",
        context_owned: "{game} 已在 MultiGamePlaytime 中",
        toast_added: "已添加 {game}",
        toast_alreadyAdded: "{game} 已在你的列表中",
        note_share: "把列表复制成代码，或粘贴朋友的代码。",
        button_copy: "复制“{list}”",
        import_placeholder: "粘贴以 MGP1: 开头的代码",
        button_import: "添加游戏",
        toast_copied: "已复制 {n} 款游戏的代码",
        toast_copyFailed: "无法复制代码",
        toast_listEmpty: "此列表还没有游戏",
        toast_importInvalid: "这不是有效的 MultiGamePlaytime 代码",
        toast_imported: "已添加 {n} 款游戏",
        set_checkUpdates: "检查更新",
        note_checkUpdates: "在 GitHub 上查找新版本，并提供一键安装。",
        notice_update: "MultiGamePlaytime {version} 已可用。",
        button_update: "更新",
        toast_updated: "已更新到 {version}",
        toast_updateFailed: "更新失败：{error}",
    },
    "zh-TW": {
        set_active: "模擬遊戲",
        note_active: "重新啟動後繼續執行。",
        set_showPlaying: "在個人檔案上顯示「正在玩」",
        note_showPlaying: "使用加星的遊戲，沒有就用第一個。遊戲時間照樣累計。",
        set_pauseOnReal: "真正在玩遊戲時暫停",
        note_pauseOnReal: "你真的在玩遊戲時暫停，結束後繼續。",
        set_panelButton: "靜音旁的按鈕",
        note_panelButton: "左下角的手把圖示，用來開關。",
        set_atOnce: "同時執行的遊戲",
        atOnce_all: "全部（最多 {n} 款）",
        set_rotate: "切換到下一批遊戲的間隔",
        note_rotate: "只有清單裡的遊戲比同時執行的多時才有用。",
        rotate_off: "從不",
        rotate_minutes: "{n} 分鐘",
        set_scheduleFrom: "模擬開始時間",
        set_scheduleTo: "模擬結束時間",
        note_schedule: "這個時段外會暫停。同一小時表示一直執行。",
        hours_any: "任何時間",
        set_language: "語言",
        language_auto: "自動（Discord 語言）",
        settings_games: "遊戲",
        settings_share: "分享清單",
        settings_stats: "統計",
        status_off: "模擬已關閉",
        status_running: "{n} 款遊戲正在執行",
        status_pausedReal: "你正在玩 {game}，已暫停",
        status_pausedSchedule: "已暫停至 {time}",
        list_select: "遊戲清單",
        list_main: "我的遊戲",
        list_newPlaceholder: "新清單的名稱",
        button_newList: "新增清單",
        button_deleteList: "刪除清單",
        toast_listExists: "已有同名的清單",
        search_placeholder: "搜尋 Discord 的遊戲清單",
        search_none: "Discord 的清單中沒有這個名稱的遊戲",
        database_loading: "正在載入 Discord 的遊戲清單…",
        database_failed: "無法載入 Discord 的遊戲清單。請檢查網路連線，然後重新開啟設定。",
        database_ready: "{n} 款遊戲 · 也可以搜「gta 5」或「fivem」",
        hint_fivem: "算作 GTA V",
        label_noPc: "無 PC 版本",
        hint_noPc: "Discord 沒有它的 PC 版資訊，可能不計入徽章。",
        button_add: "新增",
        button_remove: "移除",
        button_random: "新增 {n} 款隨機遊戲",
        button_removeAll: "全部移除",
        button_reset: "重設",
        list_heading: "你的遊戲（{n}）",
        list_empty: "還沒有遊戲。",
        running: "執行中",
        featured_on: "已顯示在個人檔案",
        featured_off: "顯示在個人檔案",
        minutes_unit: "分鐘",
        minutes_label: "{game} 的已玩分鐘數",
        note_minutes: "按 Enter 儲存。增加的分鐘會傳給 Discord，減少只改清單。",
        bulk_label: "每款遊戲的分鐘數",
        button_bulk: "新增到每款遊戲",
        toast_reported: "已向 Discord 回報 {game} 的 {n} 分鐘",
        toast_reportedAll: "已為 {count} 款遊戲回報 {n} 分鐘",
        toast_lowered: "僅在此清單中修改，Discord 不會扣除時間",
        toast_reportFailed: "找不到 Discord 的遊戲時間回報功能，未做任何變更",
        duration: "{h} 小時 {m} 分鐘",
        stats_text: "已模擬：{time} · 已玩遊戲：{n}",
        toast_started: "{n} 款遊戲正在執行",
        toast_stopped: "模擬已停止",
        toast_empty: "請先新增幾個遊戲",
        context_add: "將 {game} 新增到 MultiGamePlaytime",
        context_owned: "{game} 已在 MultiGamePlaytime 中",
        toast_added: "已新增 {game}",
        toast_alreadyAdded: "{game} 已在你的清單中",
        note_share: "把清單複製成代碼，或貼上朋友的代碼。",
        button_copy: "複製「{list}」",
        import_placeholder: "貼上以 MGP1: 開頭的代碼",
        button_import: "新增遊戲",
        toast_copied: "已複製 {n} 款遊戲的代碼",
        toast_copyFailed: "無法複製代碼",
        toast_listEmpty: "此清單還沒有遊戲",
        toast_importInvalid: "這不是有效的 MultiGamePlaytime 代碼",
        toast_imported: "已新增 {n} 款遊戲",
        set_checkUpdates: "檢查更新",
        note_checkUpdates: "在 GitHub 上尋找新版本，並提供一鍵安裝。",
        notice_update: "MultiGamePlaytime {version} 已推出。",
        button_update: "更新",
        toast_updated: "已更新至 {version}",
        toast_updateFailed: "更新失敗：{error}",
    },
};
