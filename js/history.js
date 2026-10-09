/* ==========================================================================
   history.js — transaction history table: add / render / clear / export
   ========================================================================== */

class TransactionHistory {
  constructor(tbodyEl) {
    this.tbody = tbodyEl;
    this.records = [];
  }

  add(record) {
    // record: { time, sequence, finalState, status, reason }
    this.records.unshift(record);
    this.render();
  }

  clear() {
    this.records = [];
    this.render();
  }

  render() {
    if (this.records.length === 0) {
      this.tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No transactions yet — insert a coin to begin.</td></tr>`;
      return;
    }
    this.tbody.innerHTML = this.records
      .map((r) => {
        const badgeClass = r.status === "Accepted" ? "badge-success" : r.status === "Rejected" ? "badge-error" : "badge-info";
        return `<tr>
          <td class="mono">${r.time}</td>
          <td class="mono">${r.sequence}</td>
          <td class="mono">${r.finalState}</td>
          <td><span class="badge ${badgeClass}">${r.status}</span></td>
          <td>${r.reason}</td>
        </tr>`;
      })
      .join("");
  }

  exportCSV() {
    const header = "Time,Input Sequence,Final State,Status,Reason\n";
    const rows = this.records.map((r) => `${r.time},"${r.sequence}",${r.finalState},${r.status},${r.reason}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transaction-history.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

window.TransactionHistory = TransactionHistory;
