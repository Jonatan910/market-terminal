// Libro de órdenes local, armado como recomienda Binance:
//   1) se escuchan los cambios en vivo (stream "@depth") y se guardan mientras tanto;
//   2) se pide una foto completa (REST /depth) que trae su número de versión (lastUpdateId);
//   3) se descartan los cambios viejos y se aplican los nuevos en orden.
// Si se pierde un cambio (salto en la numeración), hay que pedir otra foto.

export class OrderBook {
  constructor() {
    this.bids = new Map(); // precio -> cantidad (órdenes de compra)
    this.asks = new Map(); // precio -> cantidad (órdenes de venta)
    this.lastId = null; // versión de la última actualización aplicada
    this.synced = false; // ¿ya se aplicó el primer cambio posterior a la foto?
  }

  get ready() {
    return this.lastId != null;
  }

  loadSnapshot(snap) {
    this.bids = new Map(snap.bids.map(([p, q]) => [+p, +q]));
    this.asks = new Map(snap.asks.map(([p, q]) => [+p, +q]));
    this.lastId = snap.lastUpdateId;
    this.synced = false;
  }

  // Aplica un cambio { U: primera versión, u: última versión, b: [[precio, cant]], a: [...] }.
  // Devuelve 'applied', 'skipped' (era viejo) o 'gap' (se perdió algo: pedir foto nueva).
  apply(ev) {
    if (!this.ready) return 'skipped';
    if (ev.u <= this.lastId) return 'skipped';
    const expected = this.lastId + 1;
    if (!this.synced ? ev.U > expected : ev.U !== expected) return 'gap';
    for (const [p, q] of ev.b) setLevel(this.bids, +p, +q);
    for (const [p, q] of ev.a) setLevel(this.asks, +p, +q);
    this.lastId = ev.u;
    this.synced = true;
    return 'applied';
  }

  bestBid() {
    let best = -Infinity;
    for (const p of this.bids.keys()) if (p > best) best = p;
    return best === -Infinity ? null : best;
  }

  bestAsk() {
    let best = Infinity;
    for (const p of this.asks.keys()) if (p < best) best = p;
    return best === Infinity ? null : best;
  }
}

// Cantidad 0 = ese precio ya no tiene órdenes.
function setLevel(side, price, qty) {
  if (qty === 0) side.delete(price);
  else side.set(price, qty);
}
