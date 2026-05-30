import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandStartEvent } from "../../src/core/extensions/index.ts";
import { createHarness, type Harness } from "./harness.ts";

describe("command_start hook", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("fires with commandName and args before the handler runs", async () => {
		const events: CommandStartEvent[] = [];
		const order: string[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", (event) => {
						events.push(event);
						order.push("hook");
					});
					pi.registerCommand("greet", {
						handler: async () => {
							order.push("handler");
						},
					});
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/greet hello world");

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({ type: "command_start", commandName: "greet", args: "hello world" });
		expect(order).toEqual(["hook", "handler"]);
	});

	it("fires with empty args when no arguments are provided", async () => {
		const events: CommandStartEvent[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", (event) => {
						events.push(event);
					});
					pi.registerCommand("noop", { handler: async () => {} });
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/noop");

		expect(events).toHaveLength(1);
		expect(events[0]!.args).toBe("");
	});

	it("cancel: true prevents the command handler from running", async () => {
		const handlerRuns: string[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", () => ({ cancel: true }));
					pi.registerCommand("blocked", {
						handler: async (args) => {
							handlerRuns.push(args);
						},
					});
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/blocked some args");

		expect(handlerRuns).toHaveLength(0);
	});

	it("first cancel wins — remaining handlers and the command handler are skipped", async () => {
		const order: string[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", () => {
						order.push("hook-1");
						return { cancel: true };
					});
					pi.on("command_start", () => {
						order.push("hook-2");
					});
					pi.registerCommand("cmd", {
						handler: async () => {
							order.push("handler");
						},
					});
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/cmd");

		expect(order).toEqual(["hook-1"]);
	});

	it("does not fire for regular prompts", async () => {
		const events: CommandStartEvent[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", (event) => {
						events.push(event);
					});
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("ok")]);
		await harness.session.bindExtensions({});

		await harness.session.prompt("just a regular message");

		expect(events).toHaveLength(0);
	});

	it("does not fire when the command name is not registered", async () => {
		const events: CommandStartEvent[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", (event) => {
						events.push(event);
					});
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("ok")]);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/unknown-command");

		expect(events).toHaveLength(0);
	});

	it("a throwing hook is swallowed and the command handler still runs", async () => {
		const handlerRuns: string[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", () => {
						throw new Error("hook exploded");
					});
					pi.registerCommand("resilient", {
						handler: async (args) => {
							handlerRuns.push(args);
						},
					});
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/resilient still runs");

		expect(handlerRuns).toEqual(["still runs"]);
	});

	it("fires once per invocation across multiple registered commands", async () => {
		const events: CommandStartEvent[] = [];

		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("command_start", (event) => {
						events.push(event);
					});
					pi.registerCommand("alpha", { handler: async () => {} });
					pi.registerCommand("beta", { handler: async () => {} });
				},
			],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({});

		await harness.session.prompt("/alpha first");
		await harness.session.prompt("/beta second");

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ commandName: "alpha", args: "first" });
		expect(events[1]).toMatchObject({ commandName: "beta", args: "second" });
	});
});
