/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/perp.json`.
 */
export type Perp = {
  "address": "3ybvQ2fhnTV3qmzTSG6d8i5JpNqVpxe9D8e56arPsHhD",
  "metadata": {
    "name": "perp",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Surge perp program"
  },
  "instructions": [
    {
      "name": "crankFunding",
      "docs": [
        "Anyone can bring funding up to date (it is also done on every trade)."
      ],
      "discriminator": [
        83,
        30,
        120,
        80,
        177,
        60,
        27,
        119
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "oracle",
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundLp",
      "docs": [
        "Admin seeds the liquidity pool that takes the other side of trades."
      ],
      "discriminator": [
        171,
        16,
        234,
        196,
        110,
        204,
        243,
        168
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeMarket",
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "oracle"
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "marketParams"
            }
          }
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Anyone can close an under-margined position and earn the liquidation fee."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "oracle",
          "relations": [
            "market"
          ]
        },
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
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
      "name": "trade",
      "docs": [
        "Changes the position by `size_delta` (positive = buy, negative = sell) at the oracle index."
      ],
      "discriminator": [
        178,
        144,
        26,
        216,
        241,
        187,
        206,
        130
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "oracle",
          "relations": [
            "market"
          ]
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        }
      ],
      "args": [
        {
          "name": "sizeDelta",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updateParams",
      "discriminator": [
        108,
        178,
        190,
        95,
        94,
        203,
        116,
        20
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "marketParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "oracle",
          "relations": [
            "market"
          ]
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawLp",
      "discriminator": [
        225,
        221,
        45,
        211,
        49,
        60,
        51,
        163
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
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
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "liquidated",
      "discriminator": [
        231,
        57,
        55,
        75,
        0,
        170,
        246,
        68
      ]
    },
    {
      "name": "traded",
      "discriminator": [
        225,
        202,
        73,
        175,
        147,
        43,
        160,
        150
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badParams",
      "msg": "Invalid market parameters"
    },
    {
      "code": 6001,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6003,
      "name": "oracleNotReady",
      "msg": "Oracle has no index yet"
    },
    {
      "code": 6004,
      "name": "staleOracle",
      "msg": "Oracle index is stale"
    },
    {
      "code": 6005,
      "name": "insufficientCollateral",
      "msg": "Not enough collateral"
    },
    {
      "code": 6006,
      "name": "insufficientMargin",
      "msg": "Position would be below initial margin"
    },
    {
      "code": 6007,
      "name": "positionLimit",
      "msg": "Position size above the per-position limit"
    },
    {
      "code": 6008,
      "name": "skewLimit",
      "msg": "Trade would push long/short skew above the cap"
    },
    {
      "code": 6009,
      "name": "insufficientLp",
      "msg": "Liquidity pool too small"
    },
    {
      "code": 6010,
      "name": "insufficientVault",
      "msg": "Vault would drop below rent-exempt minimum"
    },
    {
      "code": 6011,
      "name": "notLiquidatable",
      "msg": "Position is not below maintenance margin"
    }
  ],
  "types": [
    {
      "name": "liquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "size",
            "type": "i64"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "reward",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "marketParams"
              }
            }
          },
          {
            "name": "lpBalance",
            "type": "i64"
          },
          {
            "name": "longOi",
            "type": "u64"
          },
          {
            "name": "shortOi",
            "type": "u64"
          },
          {
            "name": "cumulativeFunding",
            "type": "i128"
          },
          {
            "name": "lastFundingSlot",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "initialMarginBps",
            "type": "u16"
          },
          {
            "name": "maintenanceMarginBps",
            "type": "u16"
          },
          {
            "name": "liquidationFeeBps",
            "type": "u16"
          },
          {
            "name": "takerFeeBps",
            "type": "u16"
          },
          {
            "name": "maxFundingBpsPerDay",
            "type": "u16"
          },
          {
            "name": "maxPositionSize",
            "type": "u64"
          },
          {
            "name": "maxSkew",
            "type": "u64"
          },
          {
            "name": "maxStalenessSlots",
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
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "collateral",
            "type": "i64"
          },
          {
            "name": "size",
            "type": "i64"
          },
          {
            "name": "entryIndex",
            "type": "u64"
          },
          {
            "name": "lastCumulativeFunding",
            "type": "i128"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "traded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "sizeDelta",
            "type": "i64"
          },
          {
            "name": "newSize",
            "type": "i64"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
