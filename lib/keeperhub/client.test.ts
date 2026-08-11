import { afterEach, describe, expect, it, vi } from "vitest";
import { KeeperHubClient } from "./client";
import type { KeeperHubConfig } from "./config";
import { KeeperHubSimulationRevertError } from "./errors";
import type { KeeperHubContractCallInput, KeeperHubTransferInput } from "./types";

const config: KeeperHubConfig = {
  apiKey: "kh_test_key",
  baseUrl: "https://api.keeperhub.example",
  userAgent: "reckon-hackathon-agent/0.1",
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const zeroValueSelfTransfer: KeeperHubTransferInput = {
  chainId: 84532,
  recipientAddress: "0x000000000000000000000000000000000000dEaD",
  amount: "0",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KeeperHubClient.getKeys (auth probe)", () => {
  it("resolves ok:true on HTTP 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { valid: true, scope: "org" })));

    const client = new KeeperHubClient(config);
    await expect(client.getKeys()).resolves.toMatchObject({ ok: true });
  });

  it("hits GET /api/keys specifically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).getKeys();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://api.keeperhub.example/api/keys");
  });
});

describe("KeeperHubClient.getUser", () => {
  it("returns walletAddress: null when provisioning is pending, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { walletAddress: null })));

    const result = await new KeeperHubClient(config).getUser();
    expect(result.walletAddress).toBeNull();
  });

  it("returns the org wallet address when provisioned", async () => {
    const addr = "0x000000000000000000000000000000000000dEaD";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { walletAddress: addr })));

    const result = await new KeeperHubClient(config).getUser();
    expect(result.walletAddress).toBe(addr);
  });
});

describe("KeeperHubClient.waitForOrgWallet", () => {
  it("polls until walletAddress is provisioned", async () => {
    const addr = "0x000000000000000000000000000000000000dEaD";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { walletAddress: null }))
      .mockResolvedValueOnce(jsonResponse(200, { walletAddress: null }))
      .mockResolvedValueOnce(jsonResponse(200, { walletAddress: addr }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new KeeperHubClient(config).waitForOrgWallet({ intervalMs: 1, timeoutMs: 1000 });

    expect(result).toBe(addr);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("times out with a clear error if the wallet never provisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => jsonResponse(200, { walletAddress: null })),
    );

    await expect(
      new KeeperHubClient(config).waitForOrgWallet({ intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow(/still not provisioned/);
  });
});

describe("KeeperHubClient.simulateTransfer / executeTransfer (POST /api/execute/transfer)", () => {
  it("simulateTransfer always sends simulate: true on the wire", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        success: true,
        status: "simulated",
        from: "0x4807d3517aca44fadd988d94a2da7dc382ce72e8",
        to: "0x4807d3517aca44fadd988d94a2da7dc382ce72e8",
        value: "0",
        gasEstimate: "21000",
        simulatedReturnValue: null,
        wouldRevert: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new KeeperHubClient(config).simulateTransfer(zeroValueSelfTransfer);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.keeperhub.example/api/execute/transfer");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.simulate).toBe(true);
    expect(typeof sentBody.simulate).toBe("boolean");
    expect(result.wouldRevert).toBe(false);
    expect(result.gasEstimate).toBe("21000");
  });

  it("sends recipientAddress/amount/chainId, not to/abi/functionArgs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { wouldRevert: false }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).simulateTransfer(zeroValueSelfTransfer);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.recipientAddress).toBe(zeroValueSelfTransfer.recipientAddress);
    expect(sentBody.amount).toBe("0");
    expect(sentBody.chainId).toBe(84532);
    expect(sentBody.to).toBeUndefined();
    expect(sentBody.abi).toBeUndefined();
    expect(sentBody.functionArgs).toBeUndefined();
  });

  it("executeTransfer always sends simulate: false on the wire", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { transactionHash: "0xdeadbeef" }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).executeTransfer(zeroValueSelfTransfer);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.simulate).toBe(false);
  });

  it("executeTransfer sends the idempotency key as the Idempotency-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { transactionHash: "0xdeadbeef" }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).executeTransfer(zeroValueSelfTransfer, { idempotencyKey: "key-1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-1");
    // The header is the transport, confirmed live — not a body field.
    expect(JSON.parse(init.body as string).idempotencyKey).toBeUndefined();
  });

  it("simulateTransfer never sends an idempotency key — only real broadcasts can double-spend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).simulateTransfer(zeroValueSelfTransfer);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  it("encodes gasLimitMultiplier as a string when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).simulateTransfer({ ...zeroValueSelfTransfer, gasLimitMultiplier: 1.5 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.gasLimitMultiplier).toBe("1.5");
  });

  it("surfaces a simulated revert as KeeperHubSimulationRevertError, not a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { wouldRevert: true, revertReason: "insufficient funds" })),
    );

    await expect(new KeeperHubClient(config).simulateTransfer(zeroValueSelfTransfer)).rejects.toThrow(
      KeeperHubSimulationRevertError,
    );
  });

  it("parses transactionHash/sponsored out of a successful execute response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          transactionHash: "0xdeadbeef",
          transactionLink: "https://sepolia.basescan.org/tx/0xdeadbeef",
          sponsored: true,
        }),
      ),
    );

    const result = await new KeeperHubClient(config).executeTransfer(zeroValueSelfTransfer);

    expect(result.transactionHash).toBe("0xdeadbeef");
    expect(result.sponsored).toBe(true);
  });
});

const contractCallInput: KeeperHubContractCallInput = {
  chainId: 84532,
  contractAddress: "0x000000000000000000000000000000000000dEaD",
  functionName: "balanceOf",
  abi: JSON.stringify([{ type: "function", name: "balanceOf", inputs: [], outputs: [] }]),
  functionArgs: JSON.stringify(["0x000000000000000000000000000000000000dEaD"]),
};

describe("KeeperHubClient.simulateContractCall / callContract (POST /api/execute/contract-call)", () => {
  it("sends functionName, not abiFunction — confirmed distinct from the workflow-builder surface", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { wouldRevert: false }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).simulateContractCall(contractCallInput);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.keeperhub.example/api/execute/contract-call");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.functionName).toBe("balanceOf");
    expect(sentBody.abiFunction).toBeUndefined();
  });

  it("callContract carries an idempotency key too — the other real-broadcast path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { transactionHash: "0xdeadbeef" }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).callContract(contractCallInput, { idempotencyKey: "key-2" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-2");
    expect(JSON.parse(init.body as string).simulate).toBe(false);
  });

  it("sends abi/functionArgs as JSON-encoded strings, unchanged from the caller-supplied strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).simulateContractCall(contractCallInput);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(typeof sentBody.abi).toBe("string");
    expect(JSON.parse(sentBody.abi)).toEqual(JSON.parse(contractCallInput.abi as string));
    expect(typeof sentBody.functionArgs).toBe("string");
  });

  it("callContract always sends simulate: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { transactionHash: "0xabc" }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).callContract(contractCallInput);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).simulate).toBe(false);
  });
});

describe("KeeperHubClient.getExecutionStatus", () => {
  it("hits GET /api/execute/{executionId}/status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: "mined" }, { "X-Poll-Interval-Hint": "0" }));
    vi.stubGlobal("fetch", fetchMock);

    await new KeeperHubClient(config).getExecutionStatus("exec_123");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://api.keeperhub.example/api/execute/exec_123/status");
  });

  it("marks the result terminal when X-Poll-Interval-Hint is 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { status: "mined" }, { "X-Poll-Interval-Hint": "0" })),
    );

    const result = await new KeeperHubClient(config).getExecutionStatus("exec_123");
    expect(result.terminal).toBe(true);
    expect(result.status).toBe("mined");
  });
});
