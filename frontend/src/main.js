import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const ROW_CHIPS = [
  { row: 0, label: "东排" },
  { row: 1, label: "中排" },
  { row: 2, label: "西排" },
];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    board: { type: Object },
    picked: { type: Object },
    activeRow: { type: Number },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 28px 16px 50px; }
    .row-chips { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
    .row-chips button { border-radius: 999px; border: 1px solid #8a5a2b; background: #f6efe4; }
    .row-chips button.active { background: #8a5a2b; color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; position: relative; }
    .pit.is-row-active { box-shadow: 0 0 0 3px #fff, 0 0 0 6px #c9a227; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.board = null;
    this.picked = null;
    this.activeRow = 0;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this._refreshSeq = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.refresh();
  }

  async refresh() {
    const seq = ++this._refreshSeq;
    try {
      const board = await api("/api/board");
      if (seq !== this._refreshSeq) return; // 已有更新的装载，丢弃晚到的旧响应
      this.board = board;
      if (this.picked) {
        // 票夹必须留在当前行签：按 id 找回原坑，找不到才退回当前行的坑
        this.picked =
          board.pits.find((p) => p.id === this.picked.id) ||
          board.pits.find((p) => p.row === this.activeRow) ||
          null;
      }
    } catch (e) {
      if (seq === this._refreshSeq) this.err = e.message;
    }
  }

  pickRow(row) {
    this.activeRow = row;
    const rowPits = (this.board?.pits || []).filter((p) => p.row === row);
    if (rowPits.length) this.picked = rowPits[0];
  }

  pickPit(pit) {
    // 点哪行的坑，行签就跟到哪行，票夹与行签始终同属一行
    this.activeRow = pit.row;
    this.picked = pit;
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async writePh() {
    this.err = "";
    const pitId = this.picked?.id;
    if (pitId === undefined) return;
    try {
      const updated = await api(`/api/pits/${pitId}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      // 落地前确认抽屉仍停在该坑；换行后晚到的响应不得劫持票夹
      if (this.picked?.id === pitId) this.picked = updated;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    const pitId = this.picked?.id;
    if (pitId === undefined) return;
    try {
      const updated = await api(`/api/pits/${pitId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (this.picked?.id === pitId) this.picked = updated;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  render() {
    if (!this.ready) {
      return html`<div class="wrap">
        <h1>南冈鞣场</h1>
        <form @submit=${this.login} autocomplete="off">
          <label>用户名
            <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
          </label>
          <label>密码
            <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
          </label>
          <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
          <button>登录</button>
        </form>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>`;
    }
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`<div class="wrap">
      <h1>${this.board.yard}</h1>
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0</p>
      <div class="row-chips">
        ${ROW_CHIPS.map(
          (chip) => html`<button
            type="button"
            class=${this.activeRow === chip.row ? "active" : ""}
            @click=${() => this.pickRow(chip.row)}
          >
            ${chip.label}
          </button>`
        )}
      </div>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button
            class="pit ${p.status}${this.activeRow === p.row ? " is-row-active" : ""}"
            @click=${() => this.pickPit(p)}
          >
            <strong>${p.code}</strong><br />${LABELS[p.status]}
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section>
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>
              最近酸碱度：${this.picked.latestPh ?? "无"} ·
              ${this.picked.sampleCount} 次
            </p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }
}

customElements.define("tan-yard", TanYard);
