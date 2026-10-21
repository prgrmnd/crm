"use client";

import { createElement, useCallback } from "react";

const attributes = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  maxlength: "maxLength",
  minlength: "minLength",
  autocomplete: "autoComplete",
  inputmode: "inputMode",
  readonly: "readOnly",
  colspan: "colSpan",
  rowspan: "rowSpan",
  viewbox: "viewBox",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
};
const boolean = new Set([
  "disabled",
  "hidden",
  "required",
  "multiple",
  "readOnly",
  "autoFocus",
]);
const eventNames = {
  click: "onClick",
  input: "onInput",
  change: "onChange",
  submit: "onSubmit",
  dragstart: "onDragStart",
  dragover: "onDragOver",
  dragleave: "onDragLeave",
  drop: "onDrop",
  pointerdown: "onPointerDown",
  keydown: "onKeyDown",
};

export function styleObject(css) {
  return Object.fromEntries(
    css
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(":");
        const key = part.slice(0, colon).trim();
        return [
          key.startsWith("--")
            ? key
            : key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
          part.slice(colon + 1).trim(),
        ];
      }),
  );
}

export function ViewNode({ node, model }) {
  const ref = useCallback(
    (element) => model.mount(node, element),
    [model, node],
  );
  if (node.raw.type === "text") return node.raw.data;
  if (!node.tag) return null;
  const props = { ref };
  for (const [name, value] of Object.entries(node.attributes)) {
    if (["value", "checked", "selected", "open"].includes(name)) continue;
    const property = attributes[name] || name;
    props[property] =
      property === "style"
        ? styleObject(value)
        : boolean.has(property)
          ? true
          : value;
  }
  for (const [type, prop] of Object.entries(eventNames)) {
    props[prop] = (event) => {
      // React owns event registration. Bubbling through the presentation state
      // preserves the original ordering of local handlers and action dispatch.
      event.stopPropagation();
      model.dispatch(node, type, event);
    };
  }
  props.onFocus = (event) => {
    if (event.target === event.currentTarget) model.view.activeElement = node;
  };
  if (node.tag === "dialog") {
    props.onCancel = (event) => {
      event.preventDefault();
      model.modal.close();
    };
  }
  if (["input", "select", "textarea"].includes(node.tag)) {
    if (node.type !== "file") props.value = node.value;
    if (["checkbox", "radio"].includes(node.type)) props.checked = node.checked;
    props.onChange ??= () => {};
  } else if (node.getAttribute("value") !== null)
    props.value = node.getAttribute("value");
  const children =
    node.tag === "textarea"
      ? undefined
      : node.children.map((child) => (
          <ViewNode key={child.key} node={child} model={model} />
        ));
  if (
    [
      "input",
      "img",
      "br",
      "hr",
      "meta",
      "link",
      "area",
      "base",
      "embed",
      "source",
      "track",
      "wbr",
    ].includes(node.tag)
  )
    return createElement(node.tag, props);
  return createElement(node.tag, props, children);
}
