// contract-fixtures.mjs — REAL outputs captured 2026-07-16 from the locked
// backend contract modules (dijkstraTrace.js / prefixSumTrace.js /
// smartContent.js) run over student-style code + input. Regenerate with the
// same modules if the contract version changes; do NOT hand-edit values.
export const fixtures = {
  "dijkstraSupported": {
    "supported": true,
    "model": "recognized-dijkstra-semantic-v1",
    "deterministic": true,
    "executionMode": "semantic-model-not-arbitrary-cpp-instrumentation",
    "basis": {
      "codeHash": "0c86e3082bdb5c7b2febc390709ab4fcc0cd29818b0b81b317799d4bf4bdc8f8",
      "inputHash": "bd470c32d59a3d62cf728b24a14f9c5b4214dfe938ceb030dcfaf8d124bf912d"
    },
    "graph": {
      "nodeCount": 4,
      "edgeCount": 5,
      "directed": true,
      "indexBase": 1,
      "source": 1,
      "target": 4
    },
    "sourceLines": {
      "heapDeclaration": 10,
      "minHeap": 10,
      "loop": 12,
      "pop": 13,
      "relaxation": 16,
      "heapPush": 16
    },
    "invariant": "The min-heap extracts the smallest tentative distance; only a strictly shorter relaxation changes dist and parent.",
    "steps": [
      {
        "index": 0,
        "heapBefore": [
          {
            "node": 1,
            "distance": 0
          }
        ],
        "popped": {
          "node": 1,
          "distance": 0
        },
        "stale": false,
        "visited": [
          1
        ],
        "relaxations": [
          {
            "from": 1,
            "to": 2,
            "weight": 4,
            "previousDistance": null,
            "candidateDistance": 4,
            "accepted": true,
            "reason": "shorter-distance"
          },
          {
            "from": 1,
            "to": 3,
            "weight": 1,
            "previousDistance": null,
            "candidateDistance": 1,
            "accepted": true,
            "reason": "shorter-distance"
          }
        ],
        "heapAfter": [
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 2,
            "distance": 4
          }
        ],
        "dist": [
          {
            "node": 1,
            "distance": 0
          },
          {
            "node": 2,
            "distance": 4
          },
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 4,
            "distance": null
          }
        ]
      },
      {
        "index": 1,
        "heapBefore": [
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 2,
            "distance": 4
          }
        ],
        "popped": {
          "node": 3,
          "distance": 1
        },
        "stale": false,
        "visited": [
          1,
          3
        ],
        "relaxations": [
          {
            "from": 3,
            "to": 2,
            "weight": 2,
            "previousDistance": 4,
            "candidateDistance": 3,
            "accepted": true,
            "reason": "shorter-distance"
          },
          {
            "from": 3,
            "to": 4,
            "weight": 6,
            "previousDistance": null,
            "candidateDistance": 7,
            "accepted": true,
            "reason": "shorter-distance"
          }
        ],
        "heapAfter": [
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 2,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 7
          }
        ],
        "dist": [
          {
            "node": 1,
            "distance": 0
          },
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 4,
            "distance": 7
          }
        ]
      },
      {
        "index": 2,
        "heapBefore": [
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 2,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 7
          }
        ],
        "popped": {
          "node": 2,
          "distance": 3
        },
        "stale": false,
        "visited": [
          1,
          2,
          3
        ],
        "relaxations": [
          {
            "from": 2,
            "to": 4,
            "weight": 1,
            "previousDistance": 7,
            "candidateDistance": 4,
            "accepted": true,
            "reason": "shorter-distance"
          }
        ],
        "heapAfter": [
          {
            "node": 2,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 7
          }
        ],
        "dist": [
          {
            "node": 1,
            "distance": 0
          },
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 4,
            "distance": 4
          }
        ]
      },
      {
        "index": 3,
        "heapBefore": [
          {
            "node": 2,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 7
          }
        ],
        "popped": {
          "node": 2,
          "distance": 4
        },
        "stale": true,
        "visited": [
          1,
          2,
          3
        ],
        "relaxations": [],
        "heapAfter": [
          {
            "node": 4,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 7
          }
        ],
        "dist": [
          {
            "node": 1,
            "distance": 0
          },
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 4,
            "distance": 4
          }
        ]
      },
      {
        "index": 4,
        "heapBefore": [
          {
            "node": 4,
            "distance": 4
          },
          {
            "node": 4,
            "distance": 7
          }
        ],
        "popped": {
          "node": 4,
          "distance": 4
        },
        "stale": false,
        "visited": [
          1,
          2,
          3,
          4
        ],
        "relaxations": [],
        "heapAfter": [
          {
            "node": 4,
            "distance": 7
          }
        ],
        "dist": [
          {
            "node": 1,
            "distance": 0
          },
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 4,
            "distance": 4
          }
        ]
      },
      {
        "index": 5,
        "heapBefore": [
          {
            "node": 4,
            "distance": 7
          }
        ],
        "popped": {
          "node": 4,
          "distance": 7
        },
        "stale": true,
        "visited": [
          1,
          2,
          3,
          4
        ],
        "relaxations": [],
        "heapAfter": [],
        "dist": [
          {
            "node": 1,
            "distance": 0
          },
          {
            "node": 2,
            "distance": 3
          },
          {
            "node": 3,
            "distance": 1
          },
          {
            "node": 4,
            "distance": 4
          }
        ]
      }
    ],
    "truncated": false,
    "result": {
      "reachable": true,
      "distance": 4,
      "path": [
        1,
        3,
        2,
        4
      ],
      "distances": [
        {
          "node": 1,
          "distance": 0
        },
        {
          "node": 2,
          "distance": 3
        },
        {
          "node": 3,
          "distance": 1
        },
        {
          "node": 4,
          "distance": 4
        }
      ],
      "visited": [
        1,
        2,
        3,
        4
      ]
    },
    "fallback": {
      "kind": "input-visualizer",
      "reason": "Uses the exact weighted edge-list from stored evidence.",
      "input": "4 5\n1 2 4\n1 3 1\n3 2 2\n2 4 1\n3 4 6\n1 4",
      "visualizer": {
        "kind": "weighted-edge-list"
      }
    },
    "nextAction": {
      "id": "return-to-work",
      "state": "work",
      "label": "Compare heap and relaxations",
      "reason": "Trace is bound to the stored Judge WA evidence."
    }
  },
  "dijkstraUnsupported": {
    "supported": false,
    "reason": "unsupported-code-shape",
    "details": [
      "heapDeclaration",
      "minHeap",
      "loop",
      "pop",
      "relaxation",
      "heapPush",
      "visited-or-stale-entry guard"
    ],
    "fallback": {
      "kind": "input-visualizer",
      "reason": "unsupported-code-shape",
      "input": "4 5\n1 2 4\n1 3 1\n3 2 2\n2 4 1\n3 4 6\n1 4",
      "visualizer": {
        "kind": "weighted-edge-list"
      }
    },
    "nextAction": {
      "id": "open-visualizer",
      "state": "work",
      "label": "Open weighted graph input",
      "reason": "unsupported-code-shape"
    }
  },
  "prefixSupported": {
    "supported": true,
    "model": "recognized-prefix-sum-semantic-v1",
    "deterministic": true,
    "executionMode": "semantic-model-not-arbitrary-cpp-instrumentation",
    "basis": {
      "codeHash": "cac39989130bbe1e1b5779acfe798324388944cd971ad17a167ee2ca5fd7c04a",
      "inputHash": "b977bd472f4e31678d66ccec822dcb90ac7cebe44b3153b1768054c38f9544d9"
    },
    "sourceLines": {
      "construction": 6,
      "query": 8
    },
    "array": [
      1,
      2,
      3,
      4,
      5
    ],
    "prefix": [
      0,
      1,
      3,
      6,
      10,
      15
    ],
    "construction": [
      {
        "step": 0,
        "inputIndex": 1,
        "prefixIndex": 1,
        "previousPrefix": 0,
        "value": 1,
        "prefixValue": 1
      },
      {
        "step": 1,
        "inputIndex": 2,
        "prefixIndex": 2,
        "previousPrefix": 1,
        "value": 2,
        "prefixValue": 3
      },
      {
        "step": 2,
        "inputIndex": 3,
        "prefixIndex": 3,
        "previousPrefix": 3,
        "value": 3,
        "prefixValue": 6
      },
      {
        "step": 3,
        "inputIndex": 4,
        "prefixIndex": 4,
        "previousPrefix": 6,
        "value": 4,
        "prefixValue": 10
      },
      {
        "step": 4,
        "inputIndex": 5,
        "prefixIndex": 5,
        "previousPrefix": 10,
        "value": 5,
        "prefixValue": 15
      }
    ],
    "queries": [
      {
        "index": 0,
        "left": 1,
        "right": 3,
        "mapping": {
          "leftArrayIndex": 0,
          "rightArrayIndex": 2,
          "leftPrefixIndex": 0,
          "rightPrefixIndex": 3
        },
        "formula": "prefix[r] - prefix[l - 1]",
        "terms": {
          "rightPrefix": 6,
          "leftPrefix": 0
        },
        "result": 6,
        "directSum": 6
      },
      {
        "index": 1,
        "left": 2,
        "right": 5,
        "mapping": {
          "leftArrayIndex": 1,
          "rightArrayIndex": 4,
          "leftPrefixIndex": 1,
          "rightPrefixIndex": 5
        },
        "formula": "prefix[r] - prefix[l - 1]",
        "terms": {
          "rightPrefix": 15,
          "leftPrefix": 1
        },
        "result": 14,
        "directSum": 14
      }
    ],
    "indexMapping": {
      "inputBase": 1,
      "prefixBase": 0,
      "rule": "array position i contributes to prefix[i]; [l,r] maps to prefix[r] - prefix[l - 1]"
    },
    "offByOneCounterexample": {
      "available": true,
      "range": {
        "left": 1,
        "right": 3
      },
      "correctFormula": "prefix[r] - prefix[l - 1]",
      "commonWrongFormula": "prefix[r] - prefix[l]",
      "correctResult": 6,
      "wrongResult": 3,
      "evidence": "The wrong formula omits the left/right endpoint value on this stored array."
    },
    "fallback": {
      "kind": "input-visualizer",
      "reason": "Uses the exact array and ranges from stored evidence.",
      "input": "5\n1 2 3 4 5\n2\n1 3\n2 5",
      "visualizer": {
        "kind": "array-and-ranges"
      }
    },
    "nextAction": {
      "id": "verify-boundaries",
      "state": "verify",
      "label": "Verify boundary ranges",
      "reason": "Construction and every stored query agree with direct sums."
    }
  },
  "prefixUnsupported": {
    "supported": false,
    "reason": "unsupported-code-shape",
    "details": [
      "prefix construction",
      "range query formula"
    ],
    "fallback": {
      "kind": "input-visualizer",
      "reason": "unsupported-code-shape",
      "input": "5\n1 2 3 4 5\n2\n1 3\n2 5",
      "visualizer": {
        "kind": "array-and-ranges"
      }
    },
    "nextAction": {
      "id": "open-visualizer",
      "state": "work",
      "label": "Open array input",
      "reason": "unsupported-code-shape"
    }
  },
  "searchDijkstra": {
    "results": [
      {
        "id": "dij-1",
        "title": "Đường đi ngắn nhất có trọng số",
        "topic": "dijkstra",
        "tags": [
          "graphs"
        ],
        "status": "learning",
        "lastVerdict": "WA",
        "provider": "local",
        "collection": "speedrun",
        "updatedAt": "2026-07-15T10:00:00Z",
        "cfRating": 1400,
        "track": "verified-artifact",
        "concept": "dijkstra",
        "rating": 1400,
        "whyMatched": [
          "Concept matches: dijkstra"
        ],
        "matchScore": 45
      }
    ],
    "filters": {
      "q": "dijkstra"
    }
  },
  "entry": {
    "items": [
      {
        "id": "dij-1",
        "title": "Đường đi ngắn nhất có trọng số",
        "track": "verified-artifact",
        "concept": "dijkstra",
        "provider": "local",
        "collection": "speedrun",
        "status": "learning",
        "rating": 1400,
        "ratingEvidence": {
          "value": 1400,
          "source": "cfRating"
        },
        "reason": [
          "Unfinished work has stored WA evidence.",
          "Selection uses recorded judge/artifact evidence.",
          "Recorded rating 1400 is compared with target 1350.",
          "Content freshness: updated 0 day(s) ago."
        ],
        "score": 75,
        "scoreBreakdown": {
          "workInProgress": 40,
          "evidence": 6,
          "difficulty": 19,
          "freshness": 10
        },
        "action": {
          "type": "offer",
          "autoOpen": false,
          "href": "/api/problems/dij-1"
        }
      },
      {
        "id": "pre-1",
        "title": "Tổng đoạn con",
        "track": "verified-artifact",
        "concept": "prefix sum",
        "status": "learning",
        "rating": null,
        "ratingEvidence": null,
        "reason": [
          "Content freshness: updated 1 day(s) ago."
        ],
        "score": 10,
        "scoreBreakdown": {
          "freshness": 10
        },
        "action": {
          "type": "offer",
          "autoOpen": false,
          "href": "/api/problems/pre-1"
        }
      }
    ],
    "count": 2,
    "maxItems": 3,
    "autoOpen": false,
    "difficultyContext": {
      "targetRating": 1350,
      "source": "arena-history"
    },
    "policy": {
      "recentTopicIsWeakness": false,
      "inventMastery": false,
      "inventRating": false
    }
  }
};
