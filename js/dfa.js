/* ==========================================================================
   dfa.js
   ----------------------------------------------------------------------
   A genuine, table-driven Deterministic Finite Automaton that models the
   payment logic of the vending machine.

   Formal definition   M = (Q, Σ, δ, q0, F)

   Q  (states)   = { q0, q5, q10, ..., qMAX }  ∪  { qAccept, qError }
                   -- "amount states" represent the rupees inserted so far,
                      quantised to steps of 5 and capped at MAX_AMOUNT so
                      that Q stays finite, which is required for a DFA.

   Σ  (alphabet) = { "5", "10", "20", "invalid", "BUY", "RESET" }

   δ  (transition function), informally:
       δ(q_amt, "5")        = q_min(amt+5,  MAX)
       δ(q_amt, "10")       = q_min(amt+10, MAX)
       δ(q_amt, "20")       = q_min(amt+20, MAX)
       δ(q_amt, "invalid")  = qError               (unrecognised token -> reject)
       δ(q_amt, "BUY")      = qAccept   if amt >= price(selectedCoffee)
                             = qError    otherwise
       δ(qError, x != RESET) = qError              (qError is the ONLY reject state)
       δ(qError, "RESET")    = q0
       δ(qAccept, "RESET")   = q0
       δ(q_amt, "RESET")    = q0                   (manual/auto reset, any state)

   q0 (start state) = q0     (₹0 inserted)
   F  (accept states) = { qAccept }   -- L(M) is exactly the set of input
       strings that end with a successful "BUY" once enough coins were fed in.
   ========================================================================== */

class DFA {
  constructor(maxAmount = 100, step = 5) {
    this.MAX = maxAmount;
    this.STEP = step;
    this.alphabet = ["5", "10", "20", "invalid", "BUY", "RESET", "TIMEOUT"];
    this.startState = "q0";
    this.acceptStates = new Set(["qAccept"]);
    this.errorState = "qError";

    this.amountStates = [];
    for (let a = 0; a <= this.MAX; a += this.STEP) this.amountStates.push(`q${a}`);

    this.states = [...this.amountStates, "qAccept", "qError"];

    this.current = this.startState;
    this.lastAmountState = this.startState; // used to recover from qError
    this.price = 0; // required amount for currently selected coffee

    // full input tape recorded so far, for step-by-step replay
    this.tape = []; // { from, input, to, reason }
  }

  reset() {
    this.current = this.startState;
    this.lastAmountState = this.startState;
  }

  /** Demo 4 helper: place the machine directly in an amount state (no transition recorded). */
  preset(state) {
    this.current = state;
    this.lastAmountState = state;
  }

  clearTape() {
    this.tape = [];
  }

  amountOf(state) {
    if (!state.startsWith("q") || state === "qAccept" || state === "qError") return null;
    return parseInt(state.slice(1), 10);
  }

  setPrice(price) {
    this.price = price;
  }

  /** Pure transition function δ(state, input) -> nextState. Does not mutate. */
  delta(state, input) {
    // qAccept: only RESET leaves it
    if (state === "qAccept") return input === "RESET" ? this.startState : "qAccept";

    // qError is the single reject state: only RESET leaves it
    if (state === this.errorState) return input === "RESET" ? this.startState : this.errorState;

    // state is an amount state q<amt>
    const amt = this.amountOf(state) ?? 0;

    if (input === "RESET") return this.startState;
    if (input === "invalid" || input === "TIMEOUT") return this.errorState;
    if (["5", "10", "20"].includes(input)) {
      return `q${Math.min(amt + parseInt(input, 10), this.MAX)}`;
    }
    if (input === "BUY") return amt >= this.price ? "qAccept" : this.errorState;
    return state;
  }

  /** Display label of an input symbol (₹ for coins). */
  label(i) {
    return ["5", "10", "20"].includes(i) ? `₹${i}` : i;
  }

  reasonFor(fromState, input, toState) {
    if (fromState === "qError" && toState === "qError") return "Machine is in the reject state qError — only RESET can return it to q0.";
    if (fromState === "qAccept" && toState === "qAccept") return "Coffee already dispensed — waiting for RESET to serve the next customer.";
    if (input === "TIMEOUT") return "Timeout — no input before the time limit expired, transition to qError.";
    if (input === "invalid") return "Unrecognised token — invalid operation, transition to qError.";
    if (input === "RESET") return fromState === "qError" ? "RESET from qError — machine returns to the start state q0." : "Reset signal received — amount cleared back to q0.";
    if (["5", "10", "20"].includes(input)) {
      const before = this.amountOf(fromState) ?? 0;
      const after = this.amountOf(toState);
      return `Amount increased by ₹${input} (₹${before} → ₹${after}).`;
    }
    if (input === "BUY") {
      const amt = this.amountOf(fromState) ?? 0;
      if (toState === "qAccept") return `₹${amt} ≥ price ₹${this.price} — string accepted, dispensing coffee.`;
      if (amt === 0) return `BUY read in q0 with nothing inserted — invalid operation, transition to qError.`;
      return `₹${amt} < price ₹${this.price} — insufficient balance, transition to qError.`;
    }
    return "—";
  }

  /** Executes one input symbol on the live machine, records it on the tape. */
  step(input) {
    const from = this.current;
    if (this.amountOf(from) !== null) this.lastAmountState = from; // remembered for refund / display
    const to = this.delta(from, input);
    const reason = this.reasonFor(from, input, to);
    this.current = to;
    const entry = { from, input, to, reason, t: Date.now() };

    // Input string of this execution: every symbol since the previous RESET, including this one.
    let lastReset = -1;
    for (let i = this.tape.length - 1; i >= 0; i--) {
      if (this.tape[i].input === "RESET") { lastReset = i; break; }
    }
    const seq = [...this.tape.slice(lastReset + 1), entry];
    entry.sequence = seq.map((e) => this.label(e.input)).join(" → ");
    entry.statePath = [seq[0].from, ...seq.map((e) => e.to)].join(" → ");
    entry.path = seq[0].from + seq.map((e) => ` --${this.label(e.input)}--> ${e.to}`).join("");

    // Rejection = this symbol moved an active machine INTO qError.
    if (to === this.errorState && from !== this.errorState) {
      const amt = this.amountOf(from) ?? 0;
      const insufficient = input === "BUY" && amt > 0;
      entry.rejected = true;
      entry.rejectedString = entry.sequence;
      entry.rejectReason = insufficient ? "Insufficient Balance" : "Invalid Operation";
      entry.rejectDetail = insufficient
        ? `₹${amt} inserted < price ₹${this.price}`
        : input === "TIMEOUT" ? "inactivity timeout" : input === "BUY" ? "BUY pressed with nothing inserted" : "unrecognised token";
    }

    this.tape.push(entry);
    return entry;
  }

  isAccepting(state = this.current) {
    return this.acceptStates.has(state);
  }

  isError(state = this.current) {
    return state === this.errorState;
  }

  /** Returns a compact transition table for the currently relevant states
   *  (amount states that are reachable given MAX/STEP), used by the UI. */
  buildTransitionTable() {
    const rows = [];
    for (const s of this.amountStates) {
      const amt = this.amountOf(s);
      rows.push({
        state: s,
        amount: amt,
        "5": this.delta(s, "5"),
        "10": this.delta(s, "10"),
        "20": this.delta(s, "20"),
        BUY: amt >= this.price ? "qAccept" : "qError",
        RESET: "q0",
      });
    }
    rows.push({ state: "qAccept", amount: null, "5": "qAccept", "10": "qAccept", "20": "qAccept", BUY: "qAccept", RESET: "q0" });
    rows.push({ state: "qError", amount: null, "5": "qError", "10": "qError", "20": "qError", BUY: "qError", RESET: "q0" });
    return rows;
  }

  formalDefinitionText() {
    return {
      Q: `{ q0, q5, …, q${this.MAX}, qAccept, qError }  (|Q| = ${this.states.length})`,
      sigma: `{ ${this.alphabet.join(", ")} }`,
      q0: this.startState,
      F: `{ qAccept }`,
    };
  }
}

// exposed globally for the other modules (vanilla, no bundler)
window.DFA = DFA;
