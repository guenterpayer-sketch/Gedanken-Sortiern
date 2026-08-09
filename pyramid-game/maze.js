/**
 * Pyramid labyrinth graph + maze generation.
 *
 * The pyramid has 4 triangular side faces. Each face is subdivided into a
 * triangular lattice (barycentric grid) of R rows, from the base edge
 * (row 0) up to the apex (row R). Nodes that lie on an edge shared between
 * two faces (or the apex, shared by all four) are merged into a single
 * canonical node so the four faces form one connected 3D graph across the
 * whole surface of the pyramid.
 *
 * A perfect maze (spanning tree, no loops) is then carved out of that full
 * lattice with a randomized depth-first search, so there is always exactly
 * one path from the start to the apex, but plenty of dead-end branches to
 * get lost in.
 *
 * This file has no DOM / three.js dependency so the graph logic can be
 * unit-tested directly under Node.
 */

(function (root) {
  'use strict';

  // a+b+c = ROWS for every node on a face. c is the "height" row: 0 = base
  // edge, ROWS = apex.
  function buildPyramidGraph(ROWS, corners) {
    // corners: [c0, c1, c2, c3] base corners going around, plus apex.
    // Face f spans corners[f] (left) -> corners[(f+1)%4] (right) -> apex.
    const apex = corners.apex;
    const faceCorners = [0, 1, 2, 3].map((f) => ({
      L: corners[f],
      R: corners[(f + 1) % 4],
    }));

    const nodes = new Map(); // id -> { id, pos:{x,y,z}, row, onFaces:Set }
    const adj = new Map(); // id -> Set(neighborId)  (full lattice, pre-maze)

    function lerp3(pA, wA, pB, wB, pC, wC) {
      return {
        x: pA.x * wA + pB.x * wB + pC.x * wC,
        y: pA.y * wA + pB.y * wB + pC.y * wC,
        z: pA.z * wA + pB.z * wB + pC.z * wC,
      };
    }

    function canonicalId(f, a, b, c) {
      if (c === ROWS) return 'APEX';
      if (a === 0) return `E${f}_${(f + 1) % 4}_${c}`;
      if (b === 0) return `E${(f + 3) % 4}_${f}_${c}`;
      return `F${f}_a${a}_c${c}`;
    }

    function ensureNode(f, a, b, c) {
      const id = canonicalId(f, a, b, c);
      if (!nodes.has(id)) {
        const { L, R } = faceCorners[f];
        const pos = lerp3(L, a / ROWS, R, b / ROWS, apex, c / ROWS);
        nodes.set(id, { id, pos, row: c, onFaces: new Set([f]) });
        adj.set(id, new Set());
      } else {
        nodes.get(id).onFaces.add(f);
      }
      return id;
    }

    function addEdge(id1, id2) {
      if (id1 === id2) return;
      adj.get(id1).add(id2);
      adj.get(id2).add(id1);
    }

    for (let f = 0; f < 4; f++) {
      for (let c = 0; c <= ROWS; c++) {
        for (let a = 0; a <= ROWS - c; a++) {
          const b = ROWS - c - a;
          const id = ensureNode(f, a, b, c);
          if (a >= 1) {
            const hId = ensureNode(f, a - 1, b + 1, c);
            addEdge(id, hId);
          }
          if (c < ROWS) {
            if (a >= 1) {
              const upLeft = ensureNode(f, a - 1, b, c + 1);
              addEdge(id, upLeft);
            }
            if (b >= 1) {
              const upRight = ensureNode(f, a, b - 1, c + 1);
              addEdge(id, upRight);
            }
          }
        }
      }
    }

    return { nodes, adj, rows: ROWS };
  }

  // Randomized depth-first spanning tree (iterative, so it can't blow the
  // call stack on big mazes) -> a "perfect" maze with a unique path between
  // any two nodes.
  function generateMaze(graph, startId, rng) {
    rng = rng || Math.random;
    const visited = new Set([startId]);
    const tree = new Map();
    for (const id of graph.nodes.keys()) tree.set(id, new Set());

    const stack = [startId];
    while (stack.length) {
      const current = stack[stack.length - 1];
      const neighbors = Array.from(graph.adj.get(current)).filter(
        (n) => !visited.has(n)
      );
      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }
      // shuffle (Fisher-Yates) so branch choice is not biased by id order
      for (let i = neighbors.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
      }
      const next = neighbors[0];
      visited.add(next);
      tree.get(current).add(next);
      tree.get(next).add(current);
      stack.push(next);
    }

    if (visited.size !== graph.nodes.size) {
      throw new Error(
        `Maze generation did not reach all nodes (${visited.size}/${graph.nodes.size}) - graph must be disconnected`
      );
    }
    return tree;
  }

  // BFS shortest path in a tree (there's only one path, but BFS is a simple
  // robust way to find & measure it without recursion).
  function treePath(tree, startId, goalId) {
    const parent = new Map([[startId, null]]);
    const queue = [startId];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (cur === goalId) break;
      for (const n of tree.get(cur)) {
        if (!parent.has(n)) {
          parent.set(n, cur);
          queue.push(n);
        }
      }
    }
    if (!parent.has(goalId)) return null;
    const path = [];
    let cur = goalId;
    while (cur !== null) {
      path.push(cur);
      cur = parent.get(cur);
    }
    path.reverse();
    return path;
  }

  function pickStartNode(graph) {
    const baseNodes = Array.from(graph.nodes.values()).filter(
      (n) => n.row === 0
    );
    return baseNodes[Math.floor(Math.random() * baseNodes.length)].id;
  }

  const api = { buildPyramidGraph, generateMaze, treePath, pickStartNode };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PyramidMaze = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
