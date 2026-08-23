/* grid.js - the two ways a recipe is drawn.
   -----------------------------------------
   A recipe here is a tree, not a list: each step names the ingredients and
   earlier step results it consumes. That tree is what makes the grid view
   possible, the one where ingredients run down the left and every operation
   cell spans exactly the rows it swallows, merging rightward until a single
   final cell. The list view is the same tree read in cooking order, so the
   two can never disagree with each other.

   The one invariant the table layout needs is that nothing is consumed
   twice; a second claim on the same input is dropped here rather than
   producing a table that cannot be laid out. */
(function (global) {
'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- tree ---------- */

function buildTree(recipe) {
  var ings = recipe.ingredients || [], steps = recipe.steps || [];
  var byId = {}, i, s;
  ings.forEach(function (x) { byId[x.id] = { kind: 'ing', node: x }; });
  steps.forEach(function (x) { byId[x.id] = { kind: 'step', node: x }; });

  /* First claim wins, and a claim that would close a loop is refused. */
  var consumedBy = {}, inputs = {};
  steps.forEach(function (st) {
    inputs[st.id] = [];
    (st.inputs || []).forEach(function (x) {
      if (!byId[x] || consumedBy[x] || x === st.id) return;
      if (byId[x].kind === 'step' && reaches(x, st.id)) return;
      consumedBy[x] = st.id;
      inputs[st.id].push(x);
    });
  });

  function reaches(from, target) {
    /* Does `from` already depend, transitively, on `target`? */
    var stack = [from], seen = {}, cur, j, kids;
    while (stack.length) {
      cur = stack.pop();
      if (cur === target) return true;
      if (seen[cur]) continue;
      seen[cur] = 1;
      kids = inputs[cur] || [];
      for (j = 0; j < kids.length; j++) stack.push(kids[j]);
    }
    return false;
  }

  var roots = steps.filter(function (st) { return !consumedBy[st.id]; });
  var orphanIngs = ings.filter(function (x) { return !consumedBy[x.id]; });

  /* Column: ingredients sit at 0, a step one past its deepest input. */
  var colOf = {}, depthMemo = {};
  function col(id) {
    if (colOf[id] !== undefined) return colOf[id];
    if (byId[id] && byId[id].kind === 'ing') return (colOf[id] = 0);
    if (depthMemo[id]) return 1;                       /* loop guard */
    depthMemo[id] = 1;
    var kids = inputs[id] || [], m = 0;
    kids.forEach(function (k) { m = Math.max(m, col(k)); });
    depthMemo[id] = 0;
    return (colOf[id] = m + 1);
  }
  steps.forEach(function (st) { col(st.id); });

  var maxCol = 0;
  steps.forEach(function (st) { maxCol = Math.max(maxCol, colOf[st.id]); });

  /* Rows are the ingredient lines, ordered so every operation's inputs land
     on consecutive rows. Deepest input first: that is what keeps the left of
     a step's first row filled instead of leaving a ragged notch. */
  var rows = [], cells = [], order = [];

  function layoutInputs(id) {
    var kids = (inputs[id] || []).slice();
    kids.sort(function (a, b) { return col(b) - col(a); });
    return kids;
  }

  function place(id) {
    /* Returns [firstRow, rowCount] for the subtree rooted at id. */
    var entry = byId[id];
    if (!entry) return [rows.length, 0];
    if (entry.kind === 'ing') {
      rows.push({ ing: entry.node });
      return [rows.length - 1, 1];
    }
    var start = rows.length, count = 0;
    layoutInputs(id).forEach(function (k) { count += place(k)[1]; });
    if (count === 0) { rows.push({ ing: null }); count = 1; }   /* "preheat the oven" */
    order.push(id);
    cells.push({ id: id, step: entry.node, row: start, rowspan: count, col: colOf[id] });
    return [start, count];
  }

  roots.forEach(function (st) { place(st.id); });
  orphanIngs.forEach(function (x) { rows.push({ ing: x }); });

  /* Width: a cell reaches right to just before whatever consumes it, and a
     root reaches all the way to the edge. That is what draws the staircase. */
  cells.forEach(function (c) {
    var parent = consumedBy[c.id];
    var end = parent ? colOf[parent] : maxCol + 1;
    c.colspan = Math.max(1, end - c.col);
  });

  return {
    rows: rows, cells: cells, cols: maxCol, order: order,
    consumedBy: consumedBy, inputs: inputs, colOf: colOf,
    unassigned: steps.filter(function (st) { return (inputs[st.id] || []).length === 0; }).length,
    linked: steps.length - steps.filter(function (st) { return (inputs[st.id] || []).length === 0; }).length
  };
}

/* ---------- grid ---------- */

function renderGrid(recipe, factor, opts) {
  opts = opts || {};
  var t = buildTree(recipe);
  if (!t.rows.length) return '<p class="empty-note">Nothing to draw yet. Add some ingredients.</p>';

  var total = t.cols + 1;
  /* occupancy[row][col] marks what a rowspan or colspan already covers, so
     the gaps left by a shallow branch can be filled with blanks rather than
     shifting the cells after them into the wrong column. */
  var occ = [], r, c;
  for (r = 0; r < t.rows.length; r++) { occ[r] = []; for (c = 0; c < total; c++) occ[r][c] = null; }

  var starts = {};
  t.cells.forEach(function (cell) {
    starts[cell.row] = starts[cell.row] || [];
    starts[cell.row].push(cell);
    for (r = cell.row; r < cell.row + cell.rowspan; r++) {
      for (c = cell.col; c < cell.col + cell.colspan; c++) occ[r][c] = cell.id;
    }
  });
  for (r = 0; r < t.rows.length; r++) occ[r][0] = 'ing';

  var html = ['<div class="grid-wrap"><table class="rgrid"><tbody>'];
  for (r = 0; r < t.rows.length; r++) {
    var row = t.rows[r];
    html.push('<tr>');
    /* Column 0: the ingredient line. */
    if (row.ing) {
      html.push('<th scope="row" class="g-ing"><span class="g-ing-text">' +
        esc(RLUnits.renderIngredient(row.ing, factor)) + '</span></th>');
    } else {
      html.push('<th scope="row" class="g-ing g-ing-none"></th>');
    }
    /* Then every cell that begins on this row, in column order, with blanks
       filling whatever is still uncovered. */
    var here = (starts[r] || []).slice().sort(function (a, b) { return a.col - b.col; });
    c = 1;
    while (c < total) {
      var next = null, k;
      for (k = 0; k < here.length; k++) if (here[k].col === c) { next = here[k]; break; }
      if (next) {
        html.push('<td class="g-op" colspan="' + next.colspan + '" rowspan="' + next.rowspan +
          '" data-step="' + esc(next.id) + '"><span class="g-op-text">' + esc(next.step.text) + '</span>' +
          timerChip(next.step.text, opts) + '</td>');
        c += next.colspan;
        continue;
      }
      if (occ[r][c]) { c++; continue; }          /* covered by a cell from an earlier row */
      var span = 0;
      while (c + span < total && !occ[r][c + span] && !hasStartAt(here, c + span)) span++;
      html.push('<td class="g-blank"' + (span > 1 ? ' colspan="' + span + '"' : '') + '></td>');
      c += Math.max(1, span);
    }
    html.push('</tr>');
  }
  html.push('</tbody></table></div>');
  return html.join('');
}

function hasStartAt(list, col) {
  for (var i = 0; i < list.length; i++) if (list[i].col === col) return true;
  return false;
}

function timerChip(text, opts) {
  if (!opts || !opts.timers) return '';
  var t = RLParse.timerFor(text);
  if (!t) return '';
  return '<button class="timer-chip" type="button" data-seconds="' + t.seconds + '" data-label="' +
    esc(t.label) + '">' + esc(t.text) + '</button>';
}

/* ---------- list ---------- */

function renderList(recipe, factor, opts) {
  opts = opts || {};
  var t = buildTree(recipe);
  var html = [];

  html.push('<div class="listview">');
  html.push('<h3 class="lv-head">Ingredients</h3><ul class="lv-ings">');
  (recipe.ingredients || []).forEach(function (ing) {
    html.push('<li><span class="lv-ing-text">' + esc(RLUnits.renderIngredient(ing, factor)) + '</span></li>');
  });
  if (!(recipe.ingredients || []).length) html.push('<li class="empty-note">None listed.</li>');
  html.push('</ul>');

  /* Steps in cooking order: a step cannot be read before what it consumes,
     which is exactly the tree's post-order. */
  var seq = t.order.slice();
  (recipe.steps || []).forEach(function (s) { if (seq.indexOf(s.id) === -1) seq.push(s.id); });
  var numberOf = {};
  seq.forEach(function (id, i) { numberOf[id] = i + 1; });

  html.push('<h3 class="lv-head">Method</h3><ol class="lv-steps">');
  seq.forEach(function (id) {
    var step = null;
    (recipe.steps || []).forEach(function (s) { if (s.id === id) step = s; });
    if (!step) return;
    var uses = (t.inputs[id] || []).map(function (x) {
      var found = null;
      (recipe.ingredients || []).forEach(function (ing) { if (ing.id === x) found = ing.item; });
      if (found) return found;
      return 'step ' + (numberOf[x] || '?');
    });
    html.push('<li data-step="' + esc(id) + '"><span class="lv-step-text">' + esc(step.text) + '</span>' +
      timerChip(step.text, opts) +
      (uses.length ? '<span class="lv-uses">' + esc(uses.join(', ')) + '</span>' : '') + '</li>');
  });
  if (!seq.length) html.push('<li class="empty-note">No steps yet.</li>');
  html.push('</ol></div>');
  return html.join('');
}

/* The order cook mode walks, and what each step needs to hand. */
function cookSequence(recipe) {
  var t = buildTree(recipe), seq = t.order.slice();
  (recipe.steps || []).forEach(function (s) { if (seq.indexOf(s.id) === -1) seq.push(s.id); });
  return seq.map(function (id, i) {
    var step = null;
    (recipe.steps || []).forEach(function (s) { if (s.id === id) step = s; });
    var ings = (t.inputs[id] || []).map(function (x) {
      var found = null;
      (recipe.ingredients || []).forEach(function (ing) { if (ing.id === x) found = ing; });
      return found;
    }).filter(Boolean);
    return { n: i + 1, id: id, step: step, ingredients: ings };
  }).filter(function (x) { return x.step; });
}

global.RLGrid = {
  esc: esc, buildTree: buildTree, renderGrid: renderGrid,
  renderList: renderList, cookSequence: cookSequence
};
})(window);
