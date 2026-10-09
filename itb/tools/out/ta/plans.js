module.exports = {
  wires(plan, P, steps) {
    plan.forEach((w, i) => {
      const a = P(w.from), b = P(w.to);
      steps.push({ drag: [a[0], a[1], b[0], b[1], 14] }, { wait: 150 });
      if (i === 1) steps.push({ shot: 'tools/out/wires-mid.png' });
    });
  },
};
module.exports.swipe = function (plan, P, steps) {
  const c = P(plan.card), a = P(plan.start), b = P(plan.end);
  steps.push({ shot: 'tools/out/swipe-wallet.png' });
  steps.push({ click: c }, { wait: 900 }, { shot: 'tools/out/swipe-ready.png' });
  steps.push({ drag: [a[0], a[1], b[0], b[1], 3] }, { wait: 250 }, { shot: 'tools/out/swipe-fast.png' }, { wait: 700 });
  steps.push({ drag: [a[0], a[1], b[0], b[1], 34] }, { wait: 300 }, { shot: 'tools/out/swipe-ok.png' });
};
module.exports.swipeTiming = function (plan, P, steps) {
  const c = P(plan.card), a = P(plan.start), b = P(plan.end);
  steps.push({ click: c }, { wait: 900 });
  for (const n of [8, 14, 20, 34]) {
    steps.push({ drag: [a[0], a[1], b[0], b[1], n] }, { wait: 100 }, { eval: 'JSON.stringify([' + n + ', AS.TasksA.live && AS.TasksA.live.__lastDur, AS.TasksA.live && AS.TasksA.live.__test.last().msg])' }, { wait: 900 });
  }
};
