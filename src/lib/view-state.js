import { parseDocument } from "htmlparser2";
import { selectAll, selectOne, is } from "css-select";
import {
  getInnerHTML,
  textContent,
  removeElement,
  appendChild,
} from "domutils";
import { decodeHTML } from "entities";

// A presentation state tree, never a browser Document. Only React renders it.
// Keeping selectors over this data preserves the prototype's form dependencies
// without allowing its controller to mutate the mounted DOM.
export function createViewState(notify) {
  let serial = 0,
    disposed = false,
    queued = false;
  const cache = new WeakMap(),
    refs = new Map(),
    effects = [],
    timers = new Set();
  const root = parseDocument(
    '<html><head><meta name="theme-color" content="#5B8C3E"></head><body><div id="app"></div><dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toasts" aria-live="polite" aria-atomic="true"></div></body></html>',
  );
  const events = new Map();
  function changed() {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) notify();
    });
  }
  function wrap(raw) {
    if (!raw) return null;
    if (cache.has(raw)) return cache.get(raw);
    const node = new ViewNode(raw);
    cache.set(raw, node);
    return node;
  }
  function parse(markup) {
    const parsed = parseDocument(String(markup ?? ""), {
      lowerCaseAttributeNames: false,
    });
    // htmlparser2 treats textarea as raw text, whereas browser HTML parsing
    // decodes character references in this RCDATA element.
    for (const textarea of selectAll("textarea", parsed.children)) {
      for (const child of textarea.children)
        if (child.type === "text") child.data = decodeHTML(child.data);
    }
    return parsed.children;
  }
  function queueEffect(fn) {
    effects.push(fn);
    changed();
  }
  class ViewNode {
    constructor(raw) {
      this.raw = raw;
      this.key = ++serial;
      this.handlers = {};
      this.state = {};
    }
    get children() {
      return (this.raw.children || []).map(wrap);
    }
    get tag() {
      return this.raw.name;
    }
    get attributes() {
      return this.raw.attribs || {};
    }
    get parent() {
      return wrap(this.raw.parent);
    }
    find(selector) {
      return wrap(selectOne(selector, this.raw.children || []));
    }
    findAll(selector) {
      return selectAll(selector, this.raw.children || []).map(wrap);
    }
    closest(selector) {
      let n = this;
      while (n?.tag) {
        if (is(n.raw, selector)) return n;
        n = n.parent;
      }
      return null;
    }
    get markup() {
      return getInnerHTML(this.raw);
    }
    set markup(value) {
      for (const child of [...(this.raw.children || [])]) removeElement(child);
      for (const child of [...parse(value)]) appendChild(this.raw, child);
      if (this.tag === "select") delete this.state.value;
      changed();
    }
    get textContent() {
      return textContent(this.raw);
    }
    set textContent(value) {
      this.markup = String(value ?? "").replace(
        /[&<>]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
      );
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    setAttribute(name, value) {
      (this.raw.attribs ??= {})[name] = String(value);
      changed();
    }
    removeAttribute(name) {
      delete this.attributes[name];
      changed();
    }
    get dataset() {
      return new Proxy(
        {},
        {
          get: (_, key) =>
            this.attributes[
              "data-" +
                String(key).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())
            ],
          set: (_, key, value) => {
            this.setAttribute(
              "data-" +
                String(key).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
              value,
            );
            return true;
          },
        },
      );
    }
    get classList() {
      const has = (c) => this.className.split(/\s+/).includes(c);
      const toggle = (c, force) => {
        const add = force ?? !has(c);
        this.className = [
          ...new Set(
            this.className
              .split(/\s+/)
              .filter((x) => x && x !== c)
              .concat(add ? c : []),
          ),
        ].join(" ");
        return add;
      };
      return {
        add: (c) => toggle(c, true),
        remove: (c) => toggle(c, false),
        toggle,
        contains: has,
      };
    }
    get value() {
      if (Object.hasOwn(this.state, "value")) return this.state.value;
      if (this.tag === "select") {
        const options = this.findAll("option");
        const option =
          options.find((o) => o.getAttribute("selected") !== null) ||
          options[0];
        return option?.getAttribute("value") ?? option?.textContent ?? "";
      }
      if (this.tag === "textarea") return this.textContent;
      return (
        this.getAttribute("value") ?? (this.type === "checkbox" ? "on" : "")
      );
    }
    set value(value) {
      this.state.value = String(value ?? "");
      changed();
    }
    get checked() {
      return this.state.checked ?? this.getAttribute("checked") !== null;
    }
    set checked(value) {
      this.state.checked = Boolean(value);
      changed();
    }
    get indeterminate() {
      return this.state.indeterminate || false;
    }
    set indeterminate(value) {
      this.state.indeterminate = Boolean(value);
      changed();
    }
    get files() {
      return this.state.files || [];
    }
    get selectionStart() {
      return this.state.selectionStart ?? null;
    }
    setSelectionRange(start, end) {
      queueEffect(() => refs.get(this.key)?.setSelectionRange(start, end));
    }
    focus(options) {
      view.activeElement = this;
      queueEffect(() => refs.get(this.key)?.focus(options));
    }
    getBoundingClientRect() {
      return (
        refs.get(this.key)?.getBoundingClientRect() || {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }
      );
    }
    get open() {
      return this.state.open || false;
    }
    showModal() {
      this.state.open = true;
      changed();
    }
    close() {
      if (!this.open) return;
      this.state.open = false;
      changed();
      // Native close events are asynchronous; emulate that ordering in state.
      runtime.timeout(() => dispatch(this, "close"), 0);
    }
    set scrollTop(value) {
      queueEffect(() => {
        const ref = refs.get(this.key);
        if (ref) ref.scrollTop = value;
      });
    }
    remove() {
      removeElement(this.raw);
      changed();
    }
    replaceChildren(...nodes) {
      for (const child of [...(this.raw.children || [])]) removeElement(child);
      for (const node of nodes) appendChild(this.raw, node.raw);
      changed();
    }
    on(type, fn) {
      (this.handlers[type] ??= []).push(fn);
    }
    click() {
      if (this.tag === "a") {
        runtime.downloadURL(this.href, this.download);
        return;
      }
      dispatch(this, "click");
    }
    requestSubmit() {
      // Commit programmatic form values before using native HTML validation.
      queueEffect(() => refs.get(this.key)?.requestSubmit());
    }
  }
  for (const name of [
    "className",
    "name",
    "type",
    "id",
    "title",
    "href",
    "download",
    "content",
    "min",
    "max",
  ]) {
    const attr = name === "className" ? "class" : name;
    Object.defineProperty(ViewNode.prototype, name, {
      get() {
        return this.getAttribute(attr) || "";
      },
      set(value) {
        this.setAttribute(attr, value);
      },
    });
  }
  for (const name of ["disabled", "hidden", "required"]) {
    Object.defineProperty(ViewNode.prototype, name, {
      get() {
        return this.getAttribute(name) !== null;
      },
      set(value) {
        value ? this.setAttribute(name, "") : this.removeAttribute(name);
      },
    });
  }
  for (const name of [
    "click",
    "input",
    "change",
    "submit",
    "dragstart",
    "dragover",
    "dragleave",
    "drop",
  ]) {
    Object.defineProperty(ViewNode.prototype, "on" + name, {
      get() {
        return this.handlers[name]?.[0];
      },
      set(value) {
        this.handlers[name] = value ? [value] : [];
        changed();
      },
    });
  }
  const view = {
    find: (selector) => wrap(selectOne(selector, root.children)),
    findAll: (selector) => selectAll(selector, root.children).map(wrap),
    createElement: (tag) => wrap(parse(`<${tag}></${tag}>`)[0]),
    on(type, handler) {
      (events.get(type) || (events.set(type, []), events.get(type))).push(
        handler,
      );
    },
    activeElement: null,
  };
  view.documentElement = view.find("html");
  view.documentElement.dataset.theme =
    typeof document === "undefined"
      ? "light"
      : document.documentElement.dataset.theme || "light";
  function synchronize() {
    for (const [key, ref] of refs) {
      const node = mounted.get(key);
      if (!node || !ref) continue;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(ref.tagName)) {
        node.state.value = ref.value;
        node.state.checked = ref.checked;
        node.state.files = ref.files;
        node.state.selectionStart = ref.selectionStart;
      }
    }
  }
  const mounted = new Map();
  async function invoke(handler, e) {
    try {
      const promise = handler(e);
      changed();
      await promise;
    } finally {
      changed();
    }
  }
  function dispatch(target, type, native = {}) {
    synchronize();
    if (native.target) {
      for (const [key, ref] of refs)
        if (ref === native.target) {
          target = mounted.get(key) || target;
          break;
        }
    }
    let stopped = false;
    const event = {
      target,
      currentTarget: target,
      dataTransfer: native.dataTransfer,
      clientX: native.clientX,
      clientY: native.clientY,
      key: native.key,
      preventDefault: () => native.preventDefault?.(),
      stopPropagation: () => {
        stopped = true;
        native.stopPropagation?.();
      },
    };
    for (let node = target; node; node = node.parent) {
      event.currentTarget = node;
      for (const handler of node.handlers[type] || [])
        invoke(handler, { ...event });
      if (stopped || type === "close") break;
    }
    if (!stopped && type !== "close")
      for (const handler of events.get(type) || []) invoke(handler, event);
    changed();
  }
  function formEntries(form) {
    return form.findAll("input,select,textarea").flatMap((input) => {
      if (
        !input.name ||
        input.disabled ||
        (["checkbox", "radio"].includes(input.type) && !input.checked)
      )
        return [];
      if (input.type === "file")
        return [
          [
            input.name,
            input.files[0] ||
              new File([], "", { type: "application/octet-stream" }),
          ],
        ];
      return [[input.name, input.value]];
    });
  }
  const runtime = {
    timeout(fn, ms) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!disposed) {
          fn();
          changed();
        }
      }, ms);
      timers.add(id);
      return id;
    },
    interval(fn, ms) {
      const id = setInterval(() => {
        if (!disposed) {
          fn();
          changed();
        }
      }, ms);
      timers.add(id);
      return id;
    },
    onWindow(type, fn) {
      window.addEventListener(type, fn);
      cleanup.push(() => window.removeEventListener(type, fn));
    },
    onMedia(type, fn) {
      const media = matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener(type, fn);
      cleanup.push(() => media.removeEventListener(type, fn));
    },
    downloadURL(href, filename) {
      // Downloads, like focus and dialog.showModal(), are browser APIs behind a ref effect.
      queueEffect(() => {
        const a = document.createElement("a");
        a.href = href;
        a.download = filename;
        a.click();
      });
    },
    formEntries,
  };
  const cleanup = [];
  return {
    view,
    runtime,
    changed,
    dispatch,
    synchronize,
    app: view.find("#app"),
    modal: view.find("#modal"),
    toasts: view.find("#toasts"),
    mount(node, ref) {
      if (ref) {
        refs.set(node.key, ref);
        mounted.set(node.key, node);
      } else {
        refs.delete(node.key);
        mounted.delete(node.key);
      }
    },
    flushEffects() {
      const theme = view.documentElement.dataset.theme;
      document.documentElement.dataset.theme = theme;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = theme === "dark" ? "#151c18" : "#5B8C3E";
      for (const [key, ref] of refs) {
        const node = mounted.get(key);
        if (node.tag === "input" && node.type === "checkbox")
          ref.indeterminate = node.indeterminate;
        if (node.tag === "dialog") {
          if (node.open && !ref.open) ref.showModal();
          else if (!node.open && ref.open) ref.close();
        }
      }
      effects.splice(0).forEach((effect) => effect());
    },
    dispose() {
      disposed = true;
      timers.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      cleanup.forEach((fn) => fn());
      refs.clear();
      mounted.clear();
    },
  };
}
