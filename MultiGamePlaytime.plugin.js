/**
 * @name MultiGamePlaytime
 * @author uwemanfred64-png
 * @description Lets Discord see several games from its own game list running at the same time, so your playtime and the number of games you played grow for the Game Time and Game Variety badges. Rotates through your list, shows statistics and never asks for your account token. No library needed.
 * @version 1.0.0
 * @source https://github.com/uwemanfred64-png/MultiGamePlaytime
 * @website https://github.com/uwemanfred64-png/MultiGamePlaytime
 * @updateUrl https://raw.githubusercontent.com/uwemanfred64-png/MultiGamePlaytime/main/MultiGamePlaytime.plugin.js
 */

const GAMES_URL = "https://cdn.discordapp.com/detectables/games-v1.json";
const GAMES_FALLBACK_URL = "https://discord.com/api/v9/applications/detectable";
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

const defaults = { language: "auto", active: false, showPlaying: true, atOnce: 0, rotate: 0 };

function format(text, values) {
    return text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

function duration(seconds, t) {
    const minutes = Math.floor(seconds / 60);
    return format(t.duration, { h: Math.floor(minutes / 60).toLocaleString(), m: minutes % 60 });
}

function toGame(entry) {
    const exe = (entry.executables ?? []).find(e => e.os === "win32" && !e.is_launcher)?.name;
    return entry.id && entry.name && exe ? { id: String(entry.id), name: entry.name, exe: exe.replace(/^>/, "") } : null;
}

module.exports = class MultiGamePlaytime {
    constructor(meta) {
        this.api = new BdApi(meta.name);
        this.fakes = [];
        this.onTick = this.onTick.bind(this);
    }

    get t() {
        const chosen = this.settings?.language;
        const locale = (chosen && chosen !== "auto" ? chosen : this.stores?.Locale?.locale ?? document.documentElement.lang ?? "en").toLowerCase();
        const base = locale.split("-")[0];
        return { ...labels.en, ...labels[base] };
    }

    start() {
        const { Webpack, Data, DOM, Patcher } = this.api;
        this.stores = { RunningGame: Webpack.getStore("RunningGameStore"), Locale: Webpack.getStore("LocaleStore") };
        this.dispatcher = Webpack.getByKeys("dispatch", "subscribe", "register", { searchExports: true });
        if (!this.stores.RunningGame?.getRunningGames || !this.dispatcher) {
            this.api.UI.showToast(`${this.api.name ?? "MultiGamePlaytime"}: Discord's game detection was not found. It only exists in the desktop app.`, { type: "error" });
            this.stores = null;
            return;
        }

        const saved = Data.load("settings") ?? {};
        this.settings = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, saved[key] ?? value]));
        const games = Data.load("games");
        this.games = Array.isArray(games) ? games : [];
        this.stats = { seconds: {}, ...Data.load("stats") };
        this.rotation = Number(Data.load("rotation")) || 0;
        this.nextPid = PID_MIN + Math.floor(Math.random() * PID_RANGE);

        const store = this.stores.RunningGame;
        const merge = ret => {
            if (!this.fakes.length) return ret;
            const real = Array.isArray(ret) ? ret : [];
            return [...real, ...this.fakes.filter(f => !real.some(r => r.id === f.id))];
        };
        Patcher.after(store, "getRunningGames", (_, args, ret) => merge(ret));
        if (store.getVisibleRunningGames) Patcher.after(store, "getVisibleRunningGames", (_, args, ret) => (this.settings?.showPlaying ? merge(ret) : ret));
        if (store.getVisibleGame) Patcher.after(store, "getVisibleGame", (_, args, ret) => ret ?? (this.settings?.showPlaying ? this.fakes[0] ?? null : null));
        if (store.getGameForPID) Patcher.after(store, "getGameForPID", (_, [pid], ret) => ret ?? this.fakes.find(f => f.pid === pid) ?? null);

        DOM.addStyle("main", this.css());
        this.tickTimer = setInterval(this.onTick, MINUTE);
        if (this.settings.active) this.begin(true);
    }

    stop() {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
        if (this.stores) {
            this.countTime();
            this.setFakes([]);
        }
        this.api.Patcher.unpatchAll();
        this.api.DOM.removeStyle("main");
        this.stores = null;
        this.settings = null;
    }

    save(key, value) {
        this.api.Data.save(key, value);
    }

    batchSize() {
        const wanted = Number(this.settings.atOnce) || MAX_AT_ONCE;
        return Math.min(wanted, MAX_AT_ONCE, this.games.length);
    }

    nextBatch() {
        const size = this.batchSize();
        if (!size) return [];
        if (!(Number(this.settings.rotate) > 0) || size >= this.games.length) return this.games.slice(0, size);
        const start = this.rotation % this.games.length;
        return Array.from({ length: size }, (_, i) => this.games[(start + i) % this.games.length]);
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
            start: Date.now(),
        };
    }

    setFakes(next) {
        const previous = this.fakes;
        const removed = previous.filter(f => !next.includes(f));
        const added = next.filter(f => !previous.includes(f));
        this.fakes = next;
        if (!removed.length && !added.length) return;
        try {
            this.dispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed, added, games: this.stores.RunningGame.getRunningGames() ?? [] });
        } catch (err) {
            console.error("[MultiGamePlaytime]", err);
        }
    }

    begin(quiet = false) {
        if (!this.settings) return;
        const t = this.t;
        this.countTime();
        const batch = this.nextBatch();
        this.setFakes(batch.map(game => this.makeFake(game, this.fakes)));
        this.batchStarted = Date.now();
        this.lastTick = Date.now();
        if (quiet) return;
        if (!batch.length) this.api.UI.showToast(t.toast_empty, { type: "info" });
        else this.api.UI.showToast(format(t.toast_started, { n: batch.length }), { type: "success" });
    }

    end() {
        if (!this.settings) return;
        this.countTime();
        const running = this.fakes.length;
        this.setFakes([]);
        if (running) this.api.UI.showToast(this.t.toast_stopped, { type: "info" });
    }

    refreshBatch() {
        if (this.settings?.active) this.begin(true);
    }

    countTime() {
        if (!this.settings || !this.fakes.length || !this.lastTick) {
            this.lastTick = Date.now();
            return;
        }
        const now = Date.now();
        const seconds = Math.round(Math.min(now - this.lastTick, MAX_TICK) / 1000);
        this.lastTick = now;
        if (seconds <= 0) return;
        for (const fake of this.fakes) this.stats.seconds[fake.id] = (this.stats.seconds[fake.id] || 0) + seconds;
        this.save("stats", this.stats);
    }

    onTick() {
        if (!this.settings?.active) return;
        this.countTime();
        const minutes = Number(this.settings.rotate);
        if (minutes > 0 && this.games.length > this.batchSize() && Date.now() - this.batchStarted >= minutes * MINUTE) {
            this.rotation = (this.rotation + this.batchSize()) % this.games.length;
            this.save("rotation", this.rotation);
            this.begin(true);
        }
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
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length || !this.database) return [];
        const owned = new Set(this.games.map(g => g.id));
        const hits = [];
        for (const game of this.database) {
            const name = game.name.toLowerCase();
            if (!owned.has(game.id) && words.every(w => name.includes(w))) hits.push(game);
            if (hits.length >= SEARCH_RESULTS * 5) break;
        }
        const q = words.join(" ");
        return hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.length - b.name.length).slice(0, SEARCH_RESULTS);
    }

    randomGames(count) {
        const owned = new Set(this.games.map(g => g.id));
        const pool = (this.database ?? []).filter(g => !owned.has(g.id));
        const picked = [];
        while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        return picked;
    }

    addGames(list) {
        const owned = new Set(this.games.map(g => g.id));
        const fresh = list.filter(g => g && !owned.has(g.id)).map(({ id, name, exe }) => ({ id, name, exe }));
        if (!fresh.length) return;
        this.games = [...this.games, ...fresh];
        this.save("games", this.games);
        this.refreshBatch();
    }

    removeGame(id) {
        this.games = id == null ? [] : this.games.filter(g => g.id !== id);
        this.save("games", this.games);
        if (this.rotation >= this.games.length) this.rotation = 0;
        this.refreshBatch();
    }

    isRunning(id) {
        return this.fakes.some(f => f.id === id);
    }

    totals() {
        const values = Object.values(this.stats.seconds);
        return { seconds: values.reduce((a, b) => a + b, 0), played: values.filter(s => s >= PLAYED_SECONDS).length };
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

        return UI.buildSettingsPanel({
            settings: [
                { type: "custom", id: "notice", name: "", inline: false, children: React.createElement("div", { className: "mgp-notice" }, t.notice) },
                { type: "switch", id: "active", name: t.set_active, note: t.note_active, value: settings.active },
                { type: "switch", id: "showPlaying", name: t.set_showPlaying, note: t.note_showPlaying, value: settings.showPlaying },
                { type: "dropdown", id: "atOnce", name: t.set_atOnce, value: settings.atOnce, options: AT_ONCE.map(value => ({ label: value ? String(value) : format(t.atOnce_all, { n: MAX_AT_ONCE }), value })) },
                { type: "dropdown", id: "rotate", name: t.set_rotate, note: t.note_rotate, value: settings.rotate, options: ROTATE.map(value => ({ label: value ? format(t.rotate_minutes, { n: value }) : t.rotate_off, value })) },
                { type: "dropdown", id: "language", name: t.set_language, value: settings.language, options: [{ label: t.language_auto, value: "auto" }, { label: "English", value: "en" }, { label: "Deutsch", value: "de" }] },
                { type: "category", id: "games", name: t.settings_games, collapsible: true, shown: true, settings: [
                    { type: "custom", id: "list", name: "", inline: false, children: React.createElement(GameManager, { plugin: this }) },
                ] },
                { type: "category", id: "stats", name: t.settings_stats, collapsible: true, shown: false, settings: [
                    { type: "custom", id: "totals", name: "", inline: false, children: React.createElement(StatsView, { plugin: this }) },
                ] },
            ],
            onChange: (group, id, value) => {
                if (!this.settings || !(id in defaults)) return;
                this.settings[id] = value;
                this.save("settings", this.settings);
                if (id === "active") return value ? this.begin() : this.end();
                if (id === "atOnce" || id === "rotate") return this.refreshBatch();
                if (id === "showPlaying" && this.fakes.length) {
                    const running = this.fakes;
                    this.setFakes([]);
                    this.setFakes(running);
                }
            },
        });
    }

    css() {
        return `
.mgp-notice { padding: 12px; margin-bottom: 16px; border-radius: 8px; border-left: 4px solid var(--status-warning, #f0b232); background: var(--background-base-low, #2b2d31); color: var(--text-default, #dbdee1); font-size: 14px; line-height: 1.4; }
.mgp-manager { display: flex; flex-direction: column; gap: 12px; color: var(--text-default, #dbdee1); font-size: 14px; }
.mgp-search { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)); border-radius: 8px; background: var(--input-background, #1e1f22); color: var(--text-default, #dbdee1); font-size: 14px; }
.mgp-status { color: var(--text-muted, #949ba4); font-size: 12px; }
.mgp-list { display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; background: var(--background-base-low, #2b2d31); }
.mgp-row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 4px 12px; border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06)); }
.mgp-row:first-child { border-top: 0; }
.mgp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mgp-time { color: var(--text-muted, #949ba4); font-size: 12px; white-space: nowrap; }
.mgp-running { color: var(--status-positive, #23a55a); font-size: 12px; font-weight: 600; white-space: nowrap; }
.mgp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mgp-heading { color: var(--header-secondary, #b5bac1); font-size: 12px; font-weight: 600; text-transform: uppercase; }
.mgp-stats { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--text-default, #dbdee1); font-size: 14px; }
`;
    }
};

function button(label, onClick, color, disabled = false) {
    const { React, Components } = BdApi;
    const Button = Components?.Button;
    if (Button) return React.createElement(Button, { size: Button.Sizes?.SMALL, color: color === "red" ? Button.Colors?.RED : Button.Colors?.PRIMARY, onClick, disabled }, label);
    return React.createElement("button", { onClick, disabled }, label);
}

function GameManager({ plugin }) {
    const { React } = BdApi;
    const t = plugin.t;
    const [query, setQuery] = React.useState("");
    const [state, setState] = React.useState(plugin.database ? "ready" : "loading");
    const [, setVersion] = React.useState(0);
    const update = () => setVersion(v => v + 1);

    React.useEffect(() => {
        let alive = true;
        if (!plugin.database) plugin.loadDatabase().then(() => alive && setState("ready"), () => alive && setState("failed"));
        const timer = setInterval(update, MINUTE);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, []);

    const results = state === "ready" ? plugin.search(query) : [];
    const status = state === "loading" ? t.database_loading : state === "failed" ? t.database_failed : format(t.database_ready, { n: plugin.database.length.toLocaleString() });

    return React.createElement("div", { className: "mgp-manager" },
        React.createElement("input", { className: "mgp-search", type: "search", value: query, placeholder: t.search_placeholder, disabled: state !== "ready", onChange: e => setQuery(e.target.value) }),
        React.createElement("div", { className: "mgp-status" }, status),
        results.length > 0 && React.createElement("div", { className: "mgp-list" }, results.map(game => React.createElement("div", { className: "mgp-row", key: game.id },
            React.createElement("span", { className: "mgp-name", title: game.name }, game.name),
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
            }, "red", !plugin.games.length)
        ),
        React.createElement("div", { className: "mgp-heading" }, format(t.list_heading, { n: plugin.games.length })),
        plugin.games.length
            ? React.createElement("div", { className: "mgp-list" }, plugin.games.map(game => React.createElement("div", { className: "mgp-row", key: game.id },
                React.createElement("span", { className: "mgp-name", title: game.name }, game.name),
                plugin.isRunning(game.id) && React.createElement("span", { className: "mgp-running" }, t.running),
                React.createElement("span", { className: "mgp-time" }, duration(plugin.stats.seconds[game.id] || 0, t)),
                button(t.button_remove, () => {
                    plugin.removeGame(game.id);
                    update();
                })
            )))
            : React.createElement("div", { className: "mgp-status" }, t.list_empty)
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

const labels = {
    en: {
        notice: "Discord counts playtime for every game it sees running, also when several run at once. Progress only counts with \"Use data to personalize my Discord experience\" turned on and shows up on your badges after one to two days. Simulating games breaks Discord's Terms of Service, so your account can be restricted. This plugin never reads or sends your account token.",
        set_active: "Simulate games",
        note_active: "Discord sees the games from your list as running while Discord is open. Stays on after a restart.",
        set_showPlaying: "Show \"Playing\" on your profile",
        note_showPlaying: "Your friends see the first game as your activity. Playtime also counts when this is off.",
        set_atOnce: "Games at the same time",
        atOnce_all: "All (up to {n})",
        set_rotate: "Switch to the next games every",
        note_rotate: "When your list has more games than run at once, the next ones start after this time. Good for Game Variety.",
        rotate_off: "Never",
        rotate_minutes: "{n} minutes",
        set_language: "Language",
        language_auto: "Automatic (Discord language)",
        settings_games: "Games",
        settings_stats: "Statistics",
        search_placeholder: "Search Discord's game list",
        search_none: "No game with this name in Discord's list",
        database_loading: "Loading Discord's game list…",
        database_failed: "Discord's game list could not be loaded. Check your connection and open the settings again.",
        database_ready: "{n} games in Discord's list",
        button_add: "Add",
        button_remove: "Remove",
        button_random: "Add {n} random games",
        button_removeAll: "Remove all",
        button_reset: "Reset",
        list_heading: "Your games ({n})",
        list_empty: "No games yet. Search above or add random games.",
        running: "running",
        duration: "{h} h {m} min",
        stats_text: "Simulated: {time} · Games played: {n}",
        toast_started: "{n} games are running",
        toast_stopped: "Simulation stopped",
        toast_empty: "Add games first, they start right away",
    },
    de: {
        notice: "Discord zählt Spielzeit für jedes Spiel, das es laufen sieht, auch wenn mehrere gleichzeitig laufen. Der Fortschritt zählt nur, wenn „Daten zur Personalisierung meiner Discord-Erfahrung nutzen“ eingeschaltet ist, und erscheint nach ein bis zwei Tagen an deinen Abzeichen. Simulierte Spiele verstoßen gegen Discords Nutzungsbedingungen, dein Account kann deshalb eingeschränkt werden. Dieses Plugin liest und sendet nie deinen Account-Token.",
        set_active: "Spiele simulieren",
        note_active: "Discord sieht die Spiele aus deiner Liste als laufend, solange Discord offen ist. Bleibt nach einem Neustart an.",
        set_showPlaying: "„Spielt“ im Profil anzeigen",
        note_showPlaying: "Deine Freunde sehen das erste Spiel als deine Aktivität. Die Spielzeit zählt auch, wenn das aus ist.",
        set_atOnce: "Spiele gleichzeitig",
        atOnce_all: "Alle (bis {n})",
        set_rotate: "Zu den nächsten Spielen wechseln alle",
        note_rotate: "Hat deine Liste mehr Spiele, als gleichzeitig laufen, starten nach dieser Zeit die nächsten. Gut für Spielvielfalt.",
        rotate_off: "Nie",
        rotate_minutes: "{n} Minuten",
        set_language: "Sprache",
        language_auto: "Automatisch (Discord-Sprache)",
        settings_games: "Spiele",
        settings_stats: "Statistik",
        search_placeholder: "Discords Spieleliste durchsuchen",
        search_none: "Kein Spiel mit diesem Namen in Discords Liste",
        database_loading: "Discords Spieleliste wird geladen …",
        database_failed: "Discords Spieleliste konnte nicht geladen werden. Prüfe deine Verbindung und öffne die Einstellungen erneut.",
        database_ready: "{n} Spiele in Discords Liste",
        button_add: "Hinzufügen",
        button_remove: "Entfernen",
        button_random: "{n} zufällige Spiele hinzufügen",
        button_removeAll: "Alle entfernen",
        button_reset: "Zurücksetzen",
        list_heading: "Deine Spiele ({n})",
        list_empty: "Noch keine Spiele. Suche oben oder füge zufällige Spiele hinzu.",
        running: "läuft",
        duration: "{h} Std. {m} Min.",
        stats_text: "Simuliert: {time} · Gespielte Spiele: {n}",
        toast_started: "{n} Spiele laufen",
        toast_stopped: "Simulation beendet",
        toast_empty: "Füge zuerst Spiele hinzu, sie starten sofort",
    },
};
