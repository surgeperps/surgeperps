/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/oracle.json`.
 */
export type Oracle = {
  "address": "DsdJCXmXKXiYPEcWY1u2FFiTNZvsKKwwnUjybpfniPT7",
  "metadata": {
    "name": "oracle",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Surge oracle program"
  },
  "instructions": [
    {
      "name": "initialize",
      "docs": [
        "Creates the oracle account once; the signer becomes the authority."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setAuthority",
      "docs": [
        "Hands the oracle to a new keeper key (e.g. after a key leak)."
      ],
      "discriminator": [
        133,
        250,
        37,
        21,
        110,
        163,
        26,
        121
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "oracle"
          ]
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setWeights",
      "docs": [
        "Scheduled weight reset. Takes effect from the next update."
      ],
      "discriminator": [
        25,
        58,
        193,
        19,
        186,
        84,
        236,
        187
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "oracle"
          ]
        }
      ],
      "args": [
        {
          "name": "priorityWeightBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "updateIndex",
      "docs": [
        "The keeper publishes both sub-indices; the combined index is computed here",
        "so the weighting can't differ between the keeper and the chain."
      ],
      "discriminator": [
        102,
        132,
        25,
        95,
        6,
        162,
        53,
        33
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "oracle"
          ]
        }
      ],
      "args": [
        {
          "name": "priorityIndex",
          "type": "u64"
        },
        {
          "name": "tipIndex",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "oracle",
      "discriminator": [
        139,
        194,
        131,
        179,
        140,
        179,
        229,
        244
      ]
    }
  ],
  "events": [
    {
      "name": "indexUpdated",
      "discriminator": [
        57,
        221,
        94,
        47,
        121,
        227,
        38,
        114
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badWeight",
      "msg": "Weight must be at most 10000 bps"
    },
    {
      "code": 6001,
      "name": "overflow",
      "msg": "Index overflow"
    }
  ],
  "types": [
    {
      "name": "indexUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "priorityIndex",
            "type": "u64"
          },
          {
            "name": "tipIndex",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "oracle",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "priorityIndex",
            "type": "u64"
          },
          {
            "name": "tipIndex",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "priorityWeightBps",
            "type": "u16"
          },
          {
            "name": "lastUpdateSlot",
            "type": "u64"
          },
          {
            "name": "lastUpdateTs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
