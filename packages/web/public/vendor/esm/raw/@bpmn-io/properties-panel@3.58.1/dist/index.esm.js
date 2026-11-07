import { useContext, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from '../preact/hooks/dist/hooks.module.js';
import { isString, isFunction, isArray, get, assign, set, isObject, isNumber, debounce, isDefined } from '../../../../min-dash@5.1.0__d3a3b545.mjs';
import { jsx, jsxs, Fragment } from '../preact/jsx-runtime/dist/jsxRuntime.module.js';
import { createContext, createElement as createElement$1, render } from '../preact/dist/preact.module.js';
import { createPortal, forwardRef } from '../preact/compat/dist/compat.module.js';
import classnames from '../../../../classnames@2.5.1__d3a3b545.mjs';
import { closest, query, domify } from '../../../../min-dom@5.3.0__d3a3b545.mjs';
import { EditorView, highlightSpecialChars, drawSelection, keymap, placeholder, lineNumbers } from '../../../../@codemirror/view@6.28.1__d3a3b545.mjs';
import { Annotation, EditorState } from '../../../../@codemirror/state@6.6.0__d3a3b545.mjs';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, bracketMatching, foldKeymap } from '../../../../@codemirror/language@6.11.0__d3a3b545.mjs';
import { closeBrackets, closeBracketsKeymap } from '../../../../@codemirror/autocomplete@6.18.6__d3a3b545.mjs';
import { history, defaultKeymap, historyKeymap } from '../../../../@codemirror/commands@6.10.3__d3a3b545.mjs';
import { jsonParseLinter, json } from '../../../../@codemirror/lang-json@6.0.2__d3a3b545.mjs';
import { linter } from '../../../../@codemirror/lint@6.9.5__d3a3b545.mjs';
import { FeelersEditor } from '../../../../@bpmn-io/feelers-editor@1.1.1__d3a3b545.mjs';
import Editor from '../../../../@bpmn-io/feel-editor@2.8.1__d3a3b545.mjs';
import * as focusTrap from '../../../../focus-trap@8.0.0__d3a3b545.mjs';

function Arrow(props) {
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    ...props,
    children: jsx("path", {
      fillRule: "evenodd",
      d: "M10,12 L3,12 C2.44771525,12 2,11.5522847 2,11 C2,10.4477153 2.44771525,10 3,10 L8,10 L8,5 C8,4.44771525 8.44771525,4 9,4 C9.55228475,4 10,4.44771525 10,5 L10,12 Z",
      transform: "rotate(-45 6 8)"
    })
  });
}

function Close(props) {
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    ...props,
    children: jsx("path", {
      fillRule: "evenodd",
      d: "M12 4.7L11.3 4L8 7.3L4.7 4L4 4.7L7.3 8L4 11.3L4.7 12L8 8.7L11.3 12L12 11.3L8.7 8L12 4.7Z",
      fill: "currentColor"
    })
  });
}

function Create(props) {
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    ...props,
    children: jsx("path", {
      fillRule: "evenodd",
      d: "M9,13 L9,9 L9,9 L13,9 C13.5522847,9 14,8.55228475 14,8 C14,7.44771525 13.5522847,7 13,7 L9,7 L9,7 L9,3 C9,2.44771525 8.55228475,2 8,2 C7.44771525,2 7,2.44771525 7,3 L7,7 L7,7 L3,7 C2.44771525,7 2,7.44771525 2,8 C2,8.55228475 2.44771525,9 3,9 L7,9 L7,9 L7,13 C7,13.5522847 7.44771525,14 8,14 C8.55228475,14 9,13.5522847 9,13 Z"
    })
  });
}

function Delete(props) {
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    ...props,
    children: jsx("path", {
      fillRule: "evenodd",
      d: "M9,4 L9,11 C9,12.1 8.6,12.55 7.5,12.55 L2.5,12.55 C1.4,12.55 1,12.1 1,11 L1,4 L9,4 Z M7.5,5.5 L2.5,5.5 L2.5,9.8 C2.5,10.46 3,11 3.61111111,11 L6.38888889,11 C7,11 7.5,10.46 7.5,9.8 L7.5,5.5 Z M10,1 L8,1 L7,0 L3,0 L2,1 L0,1 L0,2.5 L10,2.5 L10,1 Z",
      transform: "translate(3 2)"
    })
  });
}

function Drag(props) {
  return jsxs("svg", {
    width: "16",
    height: "16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    children: [jsx("path", {
      fill: "#fff",
      style: {
        mixBlendMode: 'multiply'
      },
      d: "M0 0h16v16H0z"
    }), jsx("path", {
      fill: "#fff",
      style: {
        mixBlendMode: 'multiply'
      },
      d: "M0 0h16v16H0z"
    }), jsx("path", {
      d: "M7 3H5v2h2V3zM11 3H9v2h2V3zM7 7H5v2h2V7zM11 7H9v2h2V7zM7 11H5v2h2v-2zM11 11H9v2h2v-2z",
      fill: "#161616"
    })]
  });
}

function ExternalLink(props) {
  return jsx("svg", {
    width: "16",
    height: "16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    children: jsx("path", {
      fillRule: "evenodd",
      clipRule: "evenodd",
      d: "M12.637 12.637v-4.72h1.362v4.721c0 .36-.137.676-.411.95-.275.275-.591.412-.95.412H3.362c-.38 0-.703-.132-.967-.396A1.315 1.315 0 0 1 2 12.638V3.362c0-.38.132-.703.396-.967S2.982 2 3.363 2h4.553v1.363H3.363v9.274h9.274ZM14 2H9.28l-.001 1.362h2.408L5.065 9.984l.95.95 6.622-6.622v2.409H14V2Z",
      fill: "currentcolor"
    })
  });
}

function Feel(props) {
  return jsxs("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    children: [jsx("path", {
      d: "M3.6168 11.9894C3.47957 12.6745 3.22473 13.1809 2.85227 13.5085C2.48961 13.8362 1.97012 14 1.29381 14H0L0.308751 12.4213H1.57316L3.08751 4.78085H2.17596L2.48471 3.20213H3.39626L3.6315 2.01064C3.76872 1.32553 4.01866 0.819149 4.38132 0.491489C4.75378 0.16383 5.27817 0 5.95448 0H7.2483L6.93954 1.57872H5.67514L5.35168 3.20213H6.61609L6.30734 4.78085H5.04293L3.6168 11.9894Z",
      fill: "currentcolor"
    }), jsx("path", {
      d: "M5.60492 11.0213L8.63361 6.86596L7.28099 3.20213H9.35403L10.0598 5.74894H10.2362L11.927 3.20213H14L10.986 7.25319L12.3239 11.0213H10.2509L9.54517 8.41489H9.36874L7.67796 11.0213H5.60492Z",
      fill: "currentcolor"
    })]
  });
}

function Info(props) {
  return jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...props,
    children: [jsx("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), jsx("path", {
      d: "M12 16v-4"
    }), jsx("path", {
      d: "M12 8h.01"
    })]
  });
}

function Launch(props) {
  return jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 32 32",
    ...props,
    children: [jsx("path", {
      d: "M26,28H6a2.0027,2.0027,0,0,1-2-2V6A2.0027,2.0027,0,0,1,6,4H16V6H6V26H26V16h2V26A2.0027,2.0027,0,0,1,26,28Z"
    }), jsx("polygon", {
      points: "20 2 20 4 26.586 4 18 12.586 19.414 14 28 5.414 28 12 30 12 30 2 20 2"
    })]
  });
}

function OpenPopup(props) {
  return jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 16 16",
    ...props,
    children: jsx("path", {
      d: "M6 15L6 14 2.7 14 7 9.7 6.3 9 2 13.3 2 10 1 10 1 15zM10 1L10 2 13.3 2 9 6.3 9.7 7 14 2.7 14 6 15 6 15 1z"
    })
  });
}

/**
 * @typedef { {
 *   [key: string]: string;
 * } } TranslateReplacements
 */

/**
 * A simple translation stub to be used for multi-language support.
 * Can be easily replaced with a more sophisticated solution.
 *
 * @param {string} template to interpolate
 * @param {TranslateReplacements} [replacements] a map with substitutes
 *
 * @return {string} the translated string
 */
function translateFallback(template, replacements) {
  replacements = replacements || {};
  return template.replace(/{([^}]+)}/g, function (_, key) {
    return replacements[key] || '{' + key + '}';
  });
}

/**
 * @typedef { {
 *  getElementLabel: (element: object) => string,
 *  getTypeLabel: (element: object) => string,
 *  getElementIcon: (element: object) => import('preact').Component,
 *  getDocumentationRef: (element: object) => string
 * } } HeaderProvider
 */

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {HeaderProvider} props.headerProvider
 * @param {Function} [props.translate]
 */
function Header(props) {
  const {
    element,
    headerProvider,
    translate = translateFallback
  } = props;
  const {
    getElementIcon,
    getDocumentationRef,
    getElementLabel,
    getTypeLabel
  } = headerProvider;
  const label = getElementLabel(element);
  const type = getTypeLabel(element);
  const documentationRef = getDocumentationRef && getDocumentationRef(element);
  const ElementIcon = getElementIcon(element);
  return jsxs("div", {
    class: "bio-properties-panel-header",
    children: [jsx("div", {
      class: "bio-properties-panel-header-icon",
      children: ElementIcon && jsx(ElementIcon, {
        width: "32",
        height: "32",
        viewBox: "0 0 32 32"
      })
    }), jsxs("div", {
      class: "bio-properties-panel-header-labels",
      children: [jsx("div", {
        class: "bio-properties-panel-header-type",
        children: type
      }), label ? jsx("div", {
        class: "bio-properties-panel-header-label",
        children: label
      }) : null]
    }), jsx("div", {
      class: "bio-properties-panel-header-actions",
      children: documentationRef ? jsx("a", {
        rel: "noreferrer",
        class: "bio-properties-panel-header-link",
        href: documentationRef,
        title: translate('Open documentation'),
        target: "_blank",
        children: jsx(ExternalLink, {})
      }) : null
    })]
  });
}

const DescriptionContext = createContext({
  description: {},
  getDescriptionForId: () => {}
});

const DiagnosticsContext = createContext({
  diagnostics: {}
});

const ErrorsContext = createContext({
  errors: {}
});

/**
 * @typedef {Function} <propertiesPanel.showEntry> callback
 *
 * @example
 *
 * useEvent('propertiesPanel.showEntry', ({ focus = false, ...rest }) => {
 *   // ...
 * });
 *
 * @param {Object} context
 * @param {boolean} [context.focus]
 *
 * @returns void
 */

const EventContext = createContext({
  eventBus: null
});

/**
 * @typedef { {
 *   parserDialect?: import('@bpmn-io/feel-editor').ParserDialect,
 *   builtins?: import('@bpmn-io/feel-editor').Variable[],
 *   dialect?: import('@bpmn-io/feel-editor').Dialect,
 *   engines?: Record<string, string>
 * } } FeelLanguageContextType
 */

/**
 * @type {import('preact').Context<FeelLanguageContextType>}
 */
const FeelLanguageContext = createContext({});

const LayoutContext = createContext({
  layout: {},
  setLayout: () => {},
  getLayoutForKey: () => {},
  setLayoutForKey: () => {}
});

const TooltipContext = createContext({
  tooltip: {},
  getTooltipForId: () => {}
});

/**
 * Accesses the global TooltipContext and returns a tooltip for a given id and element.
 *
 * @example
 * ```jsx
 * function TextField(props) {
 *   const tooltip = useTooltipContext('input1', element);
 * }
 * ```
 *
 * @param {string} id
 * @param {object} element
 *
 * @returns {string}
 */
function useTooltipContext(id, element) {
  const {
    getTooltipForId
  } = useContext(TooltipContext);
  return getTooltipForId(id, element);
}

/**
 * DOM id of the rendered tooltip popup, so a caller whose trigger is itself
 * interactive (e.g. a button) can point `aria-describedby` at it.
 */
const TOOLTIP_ID = 'bio-properties-panel-tooltip';

/**
 * @typedef {Object} TooltipProps
 * @property {Object} [parent] - Parent element ref for portal rendering
 * @property {String} [direction='right'] - Tooltip direction ( 'right', 'top')
 * @property {String} [position] - Custom CSS position override
 * @property {Number} [showDelay=250] - Delay in ms before showing tooltip on hover
 * @property {Number} [hideDelay=250] - Delay in ms before hiding tooltip when mouse leaves, to avoid multiple tooltips from being opened, this should be the same as showDelay
 * @property {Boolean} [focusable=true] - whether the wrapper itself should be a keyboard tab stop; set to `false` when `children` is already focusable (e.g. a button), to avoid an extra tab stop
 * @property {*} [children] - Child elements to render inside the tooltip wrapper
 */

/**
 * Tooltip wrapper that provides context-based tooltip content lookup.
 * All props are forwarded to the underlying Tooltip component.
 *
 * @param {TooltipProps & {
 *   forId: String,
 *   value?: String|Object,
 *   element?: Object
 * }} props - Shared tooltip props plus wrapper-specific ones
 */
function TooltipWrapper(props) {
  const {
    forId,
    element
  } = props;
  const contextDescription = useTooltipContext(forId, element);
  const value = props.value || contextDescription;
  if (!value) {
    return props.children;
  }
  return jsx(Tooltip, {
    ...props,
    value: value,
    forId: `bio-properties-panel-${forId}`
  });
}

/**
 * @param {TooltipProps & {
 *   forId: String,
 *   value: String|Object
 * }} props
 */
function Tooltip(props) {
  const {
    forId,
    value,
    parent,
    direction = 'right',
    position,
    showDelay = 250,
    hideDelay = 250,
    focusable = true
  } = props;
  const [visible, setVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const [arrowOffset, setArrowOffset] = useState(null);
  const showTimeoutRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);
  const show = (_, delay) => {
    clearTimeout(showTimeoutRef.current);
    clearTimeout(hideTimeoutRef.current);
    if (visible) return;
    if (delay) {
      showTimeoutRef.current = setTimeout(() => {
        setVisible(true);
      }, showDelay);
    } else {
      setVisible(true);
    }
  };
  const handleWrapperMouseEnter = e => {
    show(e, true);
  };
  const hide = (delay = false) => {
    clearTimeout(showTimeoutRef.current);
    clearTimeout(hideTimeoutRef.current);
    if (delay) {
      hideTimeoutRef.current = setTimeout(() => {
        setVisible(false);
      }, hideDelay);
    } else {
      setVisible(false);
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearTimeout(showTimeoutRef.current);
      clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // Handle click outside to close tooltip for non-focusable elements
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = e => {
      // If clicking outside both the wrapper and tooltip, hide it
      if (wrapperRef.current && !wrapperRef.current.contains(e.target) && tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        hide(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, hide]);
  useLayoutEffect(() => {
    if (!visible || position) {
      setTooltipPosition(null);
      setArrowOffset(null);
      return;
    }
    if (!wrapperRef.current || !tooltipRef.current) return;
    const {
      tooltipPosition: newPosition,
      arrowOffset: newArrowOffset
    } = getTooltipPosition(wrapperRef.current, tooltipRef.current, direction);
    setTooltipPosition(newPosition);
    setArrowOffset(newArrowOffset);
  }, [visible, position]);
  const handleMouseLeave = ({
    relatedTarget
  }) => {
    // Don't hide the tooltip when moving mouse between the wrapper and the tooltip.
    if (relatedTarget === wrapperRef.current || relatedTarget === tooltipRef.current || relatedTarget?.parentElement === tooltipRef.current) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      // Check if selection is within tooltip content
      const selectionRange = selection.getRangeAt(0);
      if (tooltipRef.current?.contains(selectionRange.commonAncestorContainer) || tooltipRef.current?.contains(selection.anchorNode) || tooltipRef.current?.contains(selection.focusNode)) {
        return; // Keep tooltip open during text selection
      }
    }
    hide(true);
  };
  const handleTooltipMouseEnter = () => {
    clearTimeout(hideTimeoutRef.current);
  };
  const handleFocusOut = e => {
    const {
      relatedTarget
    } = e;

    // Don't hide if focus moved to the tooltip or another element within the wrapper
    if (tooltipRef.current?.contains(relatedTarget) || wrapperRef.current?.contains(relatedTarget)) {
      return;
    }
    hide(false);
  };
  const hideTooltipViaEscape = e => {
    e.code === 'Escape' && hide(false);
  };
  const renderTooltip = () => {
    const tooltipStyle = position || (tooltipPosition ? `right: ${tooltipPosition.right}; top: ${tooltipPosition.top}px;` : undefined);
    const arrowStyle = arrowOffset != null ? `margin-top: ${arrowOffset}px;` : undefined;
    return jsxs("div", {
      class: `bio-properties-panel-tooltip bio-theme-parent ${direction}`,
      role: "tooltip",
      id: TOOLTIP_ID,
      "aria-labelledby": forId,
      style: tooltipStyle,
      ref: tooltipRef,
      onClick: e => e.stopPropagation(),
      onMouseEnter: handleTooltipMouseEnter,
      onMouseLeave: handleMouseLeave,
      children: [jsx("div", {
        class: "bio-properties-panel-tooltip-content",
        children: value
      }), jsx("div", {
        class: "bio-properties-panel-tooltip-arrow",
        style: arrowStyle
      })]
    });
  };
  return jsxs("div", {
    class: "bio-properties-panel-tooltip-wrapper",
    tabIndex: focusable ? '0' : undefined,
    ref: wrapperRef,
    onMouseEnter: handleWrapperMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocusIn: show,
    onFocusOut: handleFocusOut,
    onKeyDown: hideTooltipViaEscape,
    children: [props.children, visible ? parent ? createPortal(renderTooltip(), parent.current) : renderTooltip() : null]
  });
}

// helper

function getTooltipPosition(refElement, tooltipElement, direction) {
  if (!refElement) {
    return {
      tooltipPosition: null,
      arrowOffset: null
    };
  }
  const refPosition = refElement.getBoundingClientRect();
  const right = `calc(100% - ${refPosition.x}px)`;
  let top = refPosition.top - 10;
  let arrowOffset = null;

  // Ensure that the tooltip is within the viewport, adjust the top position if needed.
  // This is only relevant for the 'right' direction for now
  if (tooltipElement && direction === 'right') {
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const minTop = 0;
    const maxTop = viewportHeight - tooltipRect.height;
    const originalTop = top;
    if (top > maxTop) {
      top = maxTop;
    }
    if (top < minTop) {
      top = minTop;
    }

    // Adjust the arrow position if the tooltip had to be moved to stay within viewport
    if (top !== originalTop) {
      const defaultMarginTop = 16;
      const topDiff = top - originalTop;
      arrowOffset = defaultMarginTop - topDiff;
    }
  }
  return {
    tooltipPosition: {
      right,
      top
    },
    arrowOffset
  };
}

/**
 * Accesses the global DescriptionContext and returns a description for a given id and element.
 *
 * @example
 * ```jsx
 * function TextField(props) {
 *   const description = useDescriptionContext('input1', element);
 * }
 * ```
 *
 * @param {string} id
 * @param {object} element
 *
 * @returns {string}
 */
function useDescriptionContext(id, element) {
  const {
    getDescriptionForId
  } = useContext(DescriptionContext);
  return getDescriptionForId(id, element);
}

function useDebounce(callback, debounceFn) {
  const debouncedCallback = useCallback(debounceFn(callback), [callback, debounceFn]);

  // flush pending calls before unmount the debounced function
  useEffect(() => {
    return () => {
      debouncedCallback.flush?.();
    };
  }, [debouncedCallback]);
  return debouncedCallback;
}

/**
 * @typedef { 'info'|'warning'|'error' } Severity
 *
 * @typedef {Object} DiagnosticAction
 * @property {String} label - label of the action button
 * @property {String} [ariaLabel] - accessible name of the action button, to tell apart multiple actions with the same label
 * @property {String|import('preact').ComponentChildren} [tooltip] - tooltip shown on hover/focus of the action button
 * @property {Function} onClick - callback invoked when the action is triggered
 *
 * @typedef {Object} Diagnostic
 * @property {Severity} severity
 * @property {String} [message]
 * @property {DiagnosticAction} [action]
 *
 * @callback ValidateFunction
 * @param {*} value
 * @returns {String|Diagnostic|null|undefined} a message or a diagnostic, if the value is invalid
 */

/**
 * Known severities, ordered from least to most severe.
 *
 * @type {Array<Severity>}
 */
const SEVERITIES = ['info', 'warning', 'error'];

/**
 * Entry state classes per severity. Infos do not mark the entry, they inform
 * about it.
 */
const ENTRY_SEVERITY_CLASS = {
  error: 'has-error',
  warning: 'has-warning'
};
const DEFAULT_SEVERITY = 'error';

/**
 * Entry state class for the given diagnostic, if any.
 *
 * @param {Diagnostic} [diagnostic]
 *
 * @returns {String|undefined}
 */
function getDiagnosticClass(diagnostic) {
  return ENTRY_SEVERITY_CLASS[diagnostic?.severity];
}

/**
 * Normalize a diagnostic. Plain strings and unknown severities are treated as
 * <error>, so a mistyped severity stays visible instead of being swallowed.
 *
 * @param {String|Diagnostic} [value]
 * @param {Severity} [severity] - severity to assume if none is provided
 *
 * @returns {Diagnostic|null}
 */
function toDiagnostic(value, severity = DEFAULT_SEVERITY) {
  if (!value) {
    return null;
  }
  if (isString(value)) {
    return {
      severity,
      message: value
    };
  }
  return {
    ...value,
    message: value.message || '',
    severity: SEVERITIES.includes(value.severity) ? value.severity : severity
  };
}
const MAX_RANK = SEVERITIES.length - 1;

/**
 * Pick the most severe diagnostic. Ties are resolved in favor of the first
 * one, hence callers list externally provided diagnostics first. Falsy
 * entries are ignored, so callers may pass empty local slots as-is.
 *
 * @param {Array<String|Diagnostic|null|undefined>} [diagnostics]
 *
 * @returns {Diagnostic|null}
 */
function getMostSevere(diagnostics) {
  let mostSevere = null;
  for (const value of diagnostics || []) {
    const diagnostic = toDiagnostic(value);
    if (!diagnostic) {
      continue;
    }
    if (!mostSevere || getRank(diagnostic) > getRank(mostSevere)) {
      mostSevere = diagnostic;

      // already the highest possible severity, nothing can outrank it
      if (getRank(mostSevere) === MAX_RANK) {
        break;
      }
    }
  }
  return mostSevere;
}

/**
 * Normalize an error provided through the deprecated errors, which carry a
 * message and nothing else.
 *
 * @param {String} [error]
 *
 * @returns {Diagnostic|null}
 */
function toErrorDiagnostic(error) {
  if (!error) {
    return null;
  }
  const message = isString(error) ? error : error.message;
  return message ? {
    severity: DEFAULT_SEVERITY,
    message
  } : null;
}

/**
 * Pick the most severe diagnostic across a number of entries.
 *
 * @param {Object<String, Array<Diagnostic>>} diagnostics - keyed by entry ID
 * @param {Array<String>} ids
 *
 * @returns {Diagnostic|null}
 */
function getMostSevereForIds(diagnostics, ids) {
  return getMostSevere(ids.flatMap(id => diagnostics[id] || []));
}

/**
 * Pick the most severe diagnostic across a group's entries.
 *
 * @param {Object<String, Array<Diagnostic>>} diagnostics - keyed by entry ID
 * @param {Array<import('../../PropertiesPanel').EntryDefinition>} entries
 *
 * @returns {Diagnostic|null}
 */
function getGroupDiagnostic(diagnostics, entries) {
  return getMostSevereForIds(diagnostics, entries.map(entry => entry.id));
}

/**
 * Pick the most severe diagnostic across a list group's items, including
 * their nested entries, e.g. for name-value entries.
 *
 * @param {Object<String, Array<Diagnostic>>} diagnostics - keyed by entry ID
 * @param {Array<import('../../PropertiesPanel').ListItemDefinition>} items
 *
 * @returns {Diagnostic|null}
 */
function getListDiagnostic(diagnostics, items) {
  return getMostSevereForIds(diagnostics, items.flatMap(item => [item.id, ...(item.entries || []).map(entry => entry.id)]));
}

// helpers /////////////////

function getRank(diagnostic) {
  return SEVERITIES.indexOf(diagnostic.severity);
}

const NO_DIAGNOSTICS = [];

/**
 * Accesses the diagnostics of a single entry.
 *
 * Falls back to the deprecated errors, so hosts that only provide those keep
 * working. Diagnostics take precedence.
 *
 * @param {String} id
 *
 * @returns {Array<import('../components/util/diagnostics').Diagnostic>}
 */
function useDiagnostics(id) {
  const {
    diagnostics
  } = useContext(DiagnosticsContext);
  const {
    errors
  } = useContext(ErrorsContext);
  const entryDiagnostics = diagnostics[id];
  if (entryDiagnostics && entryDiagnostics.length) {
    return entryDiagnostics;
  }
  const error = toErrorDiagnostic(errors[id]);
  return error ? [error] : NO_DIAGNOSTICS;
}

/**
 * Accesses the single most severe, externally provided diagnostic of an
 * entry, for entries that do not also combine in a local one.
 *
 * @param {String} id
 *
 * @returns {import('../components/util/diagnostics').Diagnostic|null}
 */
function useDisplayedDiagnostic(id) {
  return getMostSevere(useDiagnostics(id));
}

/**
 * Accesses the diagnostics of all entries, keyed by entry ID.
 *
 * Falls back to the deprecated errors, so hosts that only provide those keep
 * working. Diagnostics take precedence.
 *
 * @returns {Object<String, Array<import('../components/util/diagnostics').Diagnostic>>}
 */
function useAllDiagnostics() {
  const {
    diagnostics
  } = useContext(DiagnosticsContext);
  const {
    errors
  } = useContext(ErrorsContext);
  return useMemo(() => {
    const allDiagnostics = {
      ...diagnostics
    };
    for (const id in errors) {
      if (allDiagnostics[id] && allDiagnostics[id].length) {
        continue;
      }
      const error = toErrorDiagnostic(errors[id]);
      if (error) {
        allDiagnostics[id] = [error];
      }
    }
    return allDiagnostics;
  }, [diagnostics, errors]);
}

/**
 * Accesses the most severe diagnostic across a group's entries.
 *
 * @param {Array<import('../PropertiesPanel').EntryDefinition>} entries
 *
 * @returns {import('../components/util/diagnostics').Diagnostic|null}
 */
function useGroupDiagnostic(entries) {
  return getGroupDiagnostic(useAllDiagnostics(), entries);
}

/**
 * Accesses the most severe diagnostic across a list group's items,
 * including their nested entries.
 *
 * @param {Array<import('../PropertiesPanel').ListItemDefinition>} items
 *
 * @returns {import('../components/util/diagnostics').Diagnostic|null}
 */
function useListDiagnostic(items) {
  return getListDiagnostic(useAllDiagnostics(), items);
}

/**
 * Accesses the error of a single entry.
 *
 * Only reports diagnostics of severity <error>; warnings and infos are not
 * exposed here.
 *
 * @deprecated use `useDiagnostics` instead
 *
 * @param {String} id
 *
 * @returns {String|undefined}
 */
function useError(id) {
  const {
    errors
  } = useContext(ErrorsContext);
  return errors[id];
}

/**
 * Accesses the errors of all entries, keyed by entry ID.
 *
 * Only reports diagnostics of severity <error>; warnings and infos are not
 * exposed here.
 *
 * @deprecated use `useAllDiagnostics` instead
 *
 * @returns {Object<String, String>}
 */
function useErrors() {
  const {
    errors
  } = useContext(ErrorsContext);
  return errors;
}

/**
 * Subscribe to an event immediately. Update subscription after inputs changed.
 *
 * @param {string} event
 * @param {Function} callback
 */
function useEvent(event, callback, eventBus) {
  const eventContext = useContext(EventContext);
  if (!eventBus) {
    ({
      eventBus
    } = eventContext);
  }
  const didMount = useRef(false);

  // (1) subscribe immediately
  if (eventBus && !didMount.current) {
    eventBus.on(event, callback);
  }

  // (2) update subscription after inputs changed
  useEffect(() => {
    if (eventBus && didMount.current) {
      eventBus.on(event, callback);
    }
    didMount.current = true;
    return () => {
      if (eventBus) {
        eventBus.off(event, callback);
      }
    };
  }, [callback, event, eventBus]);
}

/**
 * Create a persistent key factory for plain objects without id.
 *
 * @example
 * ```jsx
 * function List({ objects }) {
 *   const getKey = useKeyFactory();
 *   return (<ol>{
 *     objects.map(obj => {
 *       const key = getKey(obj);
 *       return <li key={key}>obj.name</li>
 *     })
 *   }</ol>);
 * }
 * ```
 *
 * @param {any[]} dependencies
 * @returns {(element: object) => string}
 */
function useKeyFactory(dependencies = []) {
  const map = useMemo(() => new Map(), dependencies);
  const getKey = el => {
    let key = map.get(el);
    if (!key) {
      key = Math.random().toString().slice(-6);
      map.set(el, key);
    }
    return key;
  };
  return getKey;
}

/**
 * Creates a state that persists in the global LayoutContext.
 *
 * @example
 * ```jsx
 * function Group(props) {
 *   const [ open, setOpen ] = useLayoutState([ 'groups', 'foo', 'open' ], false);
 * }
 * ```
 *
 * @param {(string|number)[]} path
 * @param {any} [defaultValue]
 *
 * @returns {[ any, Function ]}
 */
function useLayoutState(path, defaultValue) {
  const {
    getLayoutForKey,
    setLayoutForKey
  } = useContext(LayoutContext);
  const layoutForKey = getLayoutForKey(path, defaultValue);
  const setState = useCallback(newValue => {
    setLayoutForKey(path, newValue);
  }, [setLayoutForKey]);
  return [layoutForKey, setState];
}

/**
 * @pinussilvestrus: we need to introduce our own hook to persist the previous
 * state on updates.
 *
 * cf. https://reactjs.org/docs/hooks-faq.html#how-to-get-the-previous-props-or-state
 */

function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

/**
 * Subscribe to `propertiesPanel.showEntry`.
 *
 * @param {string} id
 *
 * @returns {import('preact').Ref}
 */
function useShowEntryEvent(id) {
  const {
    onShow
  } = useContext(LayoutContext);
  const ref = useRef();
  const focus = useRef(false);
  const onShowEntry = useCallback(event => {
    if (event.id === id) {
      onShow();
      if (!focus.current) {
        focus.current = true;
      }
    }
  }, [id]);
  useEffect(() => {
    if (focus.current && ref.current) {
      if (isFunction(ref.current.focus)) {
        ref.current.focus();
      }
      if (isFunction(ref.current.select)) {
        ref.current.select();
      }
      focus.current = false;
    }
  });
  useEvent('propertiesPanel.showEntry', onShowEntry);
  return ref;
}

/**
 * @callback setSticky
 * @param {boolean} value
 */

/**
 * Resolve scroll container closest to the referenced element.
 */
function getScrollContainer(ref, scrollContainerSelector) {
  return ref.current ? closest(ref.current, scrollContainerSelector, true) : null;
}

/**
 * Use IntersectionObserver to identify when DOM element is in sticky mode.
 *
 * If sticky is observered setSticky(true) will be called.
 * If sticky mode is left, setSticky(false) will be called.
 *
 * @param {Object} ref
 * @param {string} scrollContainerSelector
 * @param {setSticky} setSticky
 */
function useStickyIntersectionObserver(ref, scrollContainerSelector, setSticky) {
  // resolved from the observed element after mount (see effect below)
  const [scrollContainer, setScrollContainer] = useState(null);
  const updateScrollContainer = useCallback(() => {
    const newScrollContainer = getScrollContainer(ref, scrollContainerSelector);
    if (newScrollContainer !== scrollContainer) {
      setScrollContainer(newScrollContainer);
    }
  }, [ref, scrollContainerSelector, scrollContainer]);
  useEffect(() => {
    updateScrollContainer();
  }, [updateScrollContainer]);
  useEvent('propertiesPanel.attach', updateScrollContainer);
  useEvent('propertiesPanel.detach', updateScrollContainer);
  useEffect(() => {
    const Observer = IntersectionObserver;

    // return early if IntersectionObserver is not available
    if (!Observer) {
      return;
    }
    const element = ref.current;
    if (!element || !scrollContainer) {
      return;
    }
    const observer = new Observer(entries => {
      // scroll container is unmounted, do not update sticky state
      if (scrollContainer.scrollHeight === 0) {
        return;
      }
      entries.forEach(entry => {
        if (entry.intersectionRatio < 1) {
          setSticky(true);
        } else if (entry.intersectionRatio === 1) {
          setSticky(false);
        }
      });
    }, {
      root: scrollContainer,
      rootMargin: '0px 0px 999999% 0px',
      // Use bottom margin to avoid stickyness when scrolling out to bottom
      threshold: [1]
    });
    observer.observe(element);

    // Unobserve if unmounted
    return () => {
      observer.unobserve(element);
    };
  }, [ref, scrollContainer, setSticky]);
}

/**
 * Creates a static function reference with changing body.
 * This is necessary when external libraries require a callback function
 * that has references to state variables.
 *
 * Usage:
 * const callback = useStaticCallback((val) => {val === currentState});
 *
 * The `callback` reference is static and can be safely used in external
 * libraries or as a prop that does not cause rerendering of children.
 *
 * The ref update is deferred to useLayoutEffect to prevent stale-closure
 * bugs when Chrome fires blur on elements removed during re-render.
 *
 * @param {Function} callback function with changing reference
 * @returns {Function} static function reference
 */
function useStaticCallback(callback) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  return useCallback((...args) => callbackRef.current(...args), []);
}

function useElementVisible(element) {
  const [visible, setVisible] = useState(!!element && !!element.clientHeight);
  useLayoutEffect(() => {
    if (!element) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      requestAnimationFrame(() => {
        const newVisible = !!entry.contentRect.height;
        if (newVisible !== visible) {
          setVisible(newVisible);
        }
      });
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [element, visible]);
  return visible;
}

/**
 * @param {import('../PropertiesPanel').GroupDefinition} props
 */
function Group(props) {
  const {
    element,
    entries = [],
    id,
    label,
    shouldOpen = false,
    translate = translateFallback
  } = props;
  const groupRef = useRef(null);
  const [open, setOpen] = useLayoutState(['groups', id, 'open'], shouldOpen);
  const onShow = useCallback(() => setOpen(true), [setOpen]);
  const toggleOpen = () => setOpen(!open);
  const [edited, setEdited] = useState(false);
  const [sticky, setSticky] = useState(false);

  // set edited state depending on all entries
  useEffect(() => {
    // TODO(@barmac): replace with CSS when `:has()` is supported in all major browsers, or rewrite as in https://github.com/camunda/camunda-modeler/issues/3815#issuecomment-1733038161
    const scheduled = requestAnimationFrame(() => {
      const hasOneEditedEntry = entries.find(entry => {
        const {
          id,
          isEdited
        } = entry;
        const entryNode = query(`[data-entry-id="${id}"]`);
        if (!isFunction(isEdited) || !entryNode) {
          return false;
        }
        const inputNode = query('.bio-properties-panel-input', entryNode);
        return isEdited(inputNode);
      });
      setEdited(hasOneEditedEntry);
    });
    return () => cancelAnimationFrame(scheduled);
  }, [entries, setEdited]);

  // set severity state depending on all entries
  const diagnostic = useGroupDiagnostic(entries);

  // set css class when group is sticky to top
  useStickyIntersectionObserver(groupRef, 'div.bio-properties-panel-scroll-container', setSticky);
  const propertiesPanelContext = {
    ...useContext(LayoutContext),
    onShow
  };
  return jsxs("div", {
    class: "bio-properties-panel-group",
    "data-group-id": 'group-' + id,
    ref: groupRef,
    children: [jsxs("div", {
      class: classnames('bio-properties-panel-group-header', edited ? '' : 'empty', open ? 'open' : '', sticky && open ? 'sticky' : ''),
      onClick: toggleOpen,
      children: [jsx("div", {
        class: "bio-properties-panel-group-header-title",
        children: jsx(TooltipWrapper, {
          value: props.tooltip,
          forId: 'group-' + id,
          element: element,
          children: label
        })
      }), jsxs("div", {
        class: "bio-properties-panel-group-header-buttons",
        children: [jsx(DataMarker, {
          edited: edited,
          severity: diagnostic?.severity,
          translate: translate
        }), jsx("button", {
          type: "button",
          title: translate('Toggle section'),
          class: "bio-properties-panel-group-header-button bio-properties-panel-arrow",
          children: jsx(Arrow, {
            class: open ? 'bio-properties-panel-arrow-down' : 'bio-properties-panel-arrow-right'
          })
        })]
      })]
    }), jsx("div", {
      class: classnames('bio-properties-panel-group-entries', open ? 'open' : ''),
      children: jsx(LayoutContext.Provider, {
        value: propertiesPanelContext,
        children: entries.map(entry => {
          const {
            component: Component,
            id
          } = entry;
          return createElement$1(Component, {
            ...entry,
            element: element,
            key: id
          });
        })
      })
    })]
  });
}
function DataMarker(props) {
  const {
    edited,
    severity,
    translate = translateFallback
  } = props;
  if (severity === 'error') {
    return jsx("div", {
      title: translate('Section contains an error'),
      class: "bio-properties-panel-dot bio-properties-panel-dot--error"
    });
  }
  if (severity === 'warning') {
    return jsx("div", {
      title: translate('Section contains a warning'),
      class: "bio-properties-panel-dot bio-properties-panel-dot--warning"
    });
  }
  if (edited) {
    return jsx("div", {
      title: translate('Section contains edits'),
      class: "bio-properties-panel-dot"
    });
  }
  return null;
}

/**
 * @typedef { {
 *  text: (element: object) => string,
 *  icon?: (element: Object) => import('preact').Component
 * } } PlaceholderDefinition
 *
 * @param { PlaceholderDefinition } props
 */
function Placeholder(props) {
  const {
    text,
    icon: Icon
  } = props;
  return jsx("div", {
    class: "bio-properties-panel open",
    children: jsxs("section", {
      class: "bio-properties-panel-placeholder",
      children: [Icon && jsx(Icon, {
        class: "bio-properties-panel-placeholder-icon"
      }), jsx("p", {
        class: "bio-properties-panel-placeholder-text",
        children: text
      })]
    })
  });
}

const DEFAULT_LAYOUT = {};
const DEFAULT_DESCRIPTION = {};
const DEFAULT_TOOLTIP = {};

/**
 * @typedef { {
 *    component: import('preact').Component,
 *    id: String,
 *    isEdited?: Function
 * } } EntryDefinition
 *
 * @typedef { {
 *    autoFocusEntry: String,
 *    autoOpen?: Boolean,
 *    entries: Array<EntryDefinition>,
 *    id: String,
 *    label: String|import('preact').ComponentChildren,
 *    remove: (event: MouseEvent) => void
 * } } ListItemDefinition
 *
 * @typedef { {
 *    add: (event: MouseEvent) => void,
 *    component: import('preact').Component,
 *    element: Object,
 *    id: String,
 *    items: Array<ListItemDefinition>,
 *    label: String,
 *    shouldOpen?: Boolean,
 *    translate?: Function
 * } } ListGroupDefinition
 *
 * @typedef { {
 *    component?: import('preact').Component,
 *    entries: Array<EntryDefinition>,
 *    id: String,
 *    label: String,
 *    shouldOpen?: Boolean,
 *    translate?: Function
 * } } GroupDefinition
 *
 *  @typedef { {
 *    [id: String]: GetDescriptionFunction
 * } } DescriptionConfig
 *
 *  @typedef { {
 *    [id: String]: GetTooltipFunction
 * } } TooltipConfig
 *
 * @callback { {
 * @param {string} id
 * @param {Object} element
 * @returns {string}
 * } } GetDescriptionFunction
 *
 * @callback { {
 * @param {string} id
 * @param {Object} element
 * @returns {string}
 * } } GetTooltipFunction
 *
 * @typedef { {
 *  getEmpty: (element: object) => import('./components/Placeholder').PlaceholderDefinition,
 *  getMultiple: (element: Object) => import('./components/Placeholder').PlaceholderDefinition
 * } } PlaceholderProvider
 *
 */

/**
 * A basic properties panel component. Describes *how* content will be rendered, accepts
 * data from implementor to describe *what* will be rendered.
 *
 * If `headerProvider` is omitted (or `null`), the built-in `<Header>` is not rendered;
 * consumers can render `<Header>` standalone elsewhere using the same provider shape.
 *
 * @param {Object} props
 * @param {Object|Array} props.element
 * @param {import('./components/Header').HeaderProvider} [props.headerProvider]
 * @param {PlaceholderProvider} [props.placeholderProvider]
 * @param {Array<GroupDefinition|ListGroupDefinition>} props.groups
 * @param {Object} [props.layoutConfig]
 * @param {Function} [props.layoutChanged]
 * @param {DescriptionConfig} [props.descriptionConfig]
 * @param {Function} [props.descriptionLoaded]
 * @param {TooltipConfig} [props.tooltipConfig]
 * @param {Function} [props.tooltipLoaded]
 * @param {HTMLElement} [props.feelPopupContainer]
 * @param {Function} [props.getFeelPopupLinks]
 * @param {Object} [props.eventBus]
 */
function PropertiesPanel(props) {
  const {
    element,
    headerProvider,
    placeholderProvider,
    groups,
    layoutConfig,
    layoutChanged,
    descriptionConfig,
    descriptionLoaded,
    tooltipConfig,
    tooltipLoaded,
    eventBus
  } = props;

  // set-up layout context
  const [layout, setLayout] = useState(createLayout(layoutConfig));

  // react to external changes in the layout config
  useUpdateLayoutEffect(() => {
    const newLayout = createLayout(layoutConfig);
    setLayout(newLayout);
  }, [layoutConfig]);
  useEffect(() => {
    if (typeof layoutChanged === 'function') {
      layoutChanged(layout);
    }
  }, [layout, layoutChanged]);
  const getLayoutForKey = (key, defaultValue) => {
    return get(layout, key, defaultValue);
  };
  const setLayoutForKey = (key, config) => {
    setLayout(prevLayout => {
      const newLayout = assign({}, prevLayout);
      set(newLayout, key, config);
      return newLayout;
    });
  };
  const layoutContext = {
    layout,
    setLayout,
    getLayoutForKey,
    setLayoutForKey
  };

  // set-up description context
  const description = useMemo(() => createDescriptionContext(descriptionConfig), [descriptionConfig]);
  useEffect(() => {
    if (typeof descriptionLoaded === 'function') {
      descriptionLoaded(description);
    }
  }, [description, descriptionLoaded]);
  const getDescriptionForId = (id, element) => {
    return description[id] && description[id](element);
  };
  const descriptionContext = {
    description,
    getDescriptionForId
  };

  // set-up tooltip context
  const tooltip = useMemo(() => createTooltipContext(tooltipConfig), [tooltipConfig]);
  useEffect(() => {
    if (typeof tooltipLoaded === 'function') {
      tooltipLoaded(tooltip);
    }
  }, [tooltip, tooltipLoaded]);
  const getTooltipForId = (id, element) => {
    return tooltip[id] && tooltip[id](element);
  };
  const tooltipContext = {
    tooltip,
    getTooltipForId
  };
  const [diagnostics, setDiagnostics] = useState({});
  const onSetDiagnostics = ({
    diagnostics
  }) => setDiagnostics(normalizeDiagnostics(diagnostics));
  useEvent('propertiesPanel.setDiagnostics', onSetDiagnostics, eventBus);

  // deprecated: `setErrors` is a shorthand for `setDiagnostics`, translating
  // the string-only legacy shape into diagnostics
  const onSetErrors = ({
    errors
  }) => setDiagnostics(toDiagnosticsMap(errors));
  useEvent('propertiesPanel.setErrors', onSetErrors, eventBus);
  const diagnosticsContext = useMemo(() => ({
    diagnostics
  }), [diagnostics]);
  const errorsContext = useMemo(() => ({
    errors: createErrors(diagnostics)
  }), [diagnostics]);
  const eventContext = {
    eventBus
  };
  const propertiesPanelContext = {
    element
  };

  // empty state
  if (placeholderProvider && !element) {
    return jsx(Placeholder, {
      ...placeholderProvider.getEmpty()
    });
  }

  // multiple state
  if (placeholderProvider && isArray(element)) {
    return jsx(Placeholder, {
      ...placeholderProvider.getMultiple()
    });
  }
  return jsx(LayoutContext.Provider, {
    value: propertiesPanelContext,
    children: jsx(DiagnosticsContext.Provider, {
      value: diagnosticsContext,
      children: jsx(ErrorsContext.Provider, {
        value: errorsContext,
        children: jsx(DescriptionContext.Provider, {
          value: descriptionContext,
          children: jsx(TooltipContext.Provider, {
            value: tooltipContext,
            children: jsx(LayoutContext.Provider, {
              value: layoutContext,
              children: jsx(EventContext.Provider, {
                value: eventContext,
                children: jsxs("div", {
                  class: "bio-properties-panel bio-theme-parent",
                  children: [headerProvider ? jsx(Header, {
                    element: element,
                    headerProvider: headerProvider
                  }) : null, jsx("div", {
                    class: "bio-properties-panel-scroll-container",
                    children: groups.map(group => {
                      const {
                        component: Component = Group,
                        id
                      } = group;
                      return createElement$1(Component, {
                        ...group,
                        key: id,
                        element: element
                      });
                    })
                  })]
                })
              })
            })
          })
        })
      })
    })
  });
}

// helpers //////////////////

/**
 * Normalize a diagnostics map, keyed by entry ID.
 *
 * @param {Object<String, Array<String|import('./components/util/diagnostics').Diagnostic>>} diagnostics
 *
 * @returns {Object<String, Array<import('./components/util/diagnostics').Diagnostic>>}
 */
function normalizeDiagnostics(diagnostics) {
  const normalized = {};
  for (const id in diagnostics) {
    normalized[id] = asArray(diagnostics[id]).map(diagnostic => toDiagnostic(diagnostic)).filter(Boolean);
  }
  return normalized;
}

/**
 * Translate the deprecated errors, which carry a message and nothing else,
 * into a diagnostics map, keyed by entry ID.
 *
 * @param {Object<String, String>} errors
 *
 * @returns {Object<String, Array<import('./components/util/diagnostics').Diagnostic>>}
 */
function toDiagnosticsMap(errors) {
  const diagnostics = {};
  for (const id in errors) {
    const error = toErrorDiagnostic(errors[id]);
    if (error) {
      diagnostics[id] = [error];
    }
  }
  return diagnostics;
}

/**
 * Project the diagnostics of severity <error> to the deprecated errors,
 * keyed by entry ID.
 *
 * @param {Object<String, Array<import('./components/util/diagnostics').Diagnostic>>} diagnostics
 *
 * @returns {Object<String, String>}
 */
function createErrors(diagnostics) {
  const errors = {};
  for (const id in diagnostics) {
    const error = diagnostics[id].find(({
      severity
    }) => severity === 'error');
    if (error) {
      errors[id] = error.message;
    }
  }
  return errors;
}
function asArray(value) {
  return isArray(value) ? value : [value];
}
function createLayout(overrides = {}, defaults = DEFAULT_LAYOUT) {
  return {
    ...defaults,
    ...overrides
  };
}
function createDescriptionContext(overrides = {}) {
  return {
    ...DEFAULT_DESCRIPTION,
    ...overrides
  };
}
function createTooltipContext(overrides = {}) {
  return {
    ...DEFAULT_TOOLTIP,
    ...overrides
  };
}

// hooks //////////////////

/**
 * This hook behaves like useLayoutEffect, but does not trigger on the first render.
 *
 * @param {Function} effect
 * @param {Array} deps
 */
function useUpdateLayoutEffect(effect, deps) {
  const isMounted = useRef(false);
  useLayoutEffect(() => {
    if (isMounted.current) {
      return effect();
    } else {
      isMounted.current = true;
    }
  }, deps);
}

/**
 *
 * @param {object} props
 * @param {string} [props.class]
 * @param {import('preact').Component[]} [props.menuItems]
 * @returns
 */
function DropdownButton(props) {
  const {
    class: className,
    children,
    menuItems = []
  } = props;
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  function onDropdownToggle(event) {
    if (menuRef.current && menuRef.current.contains(event.target)) {
      return;
    }
    event.stopPropagation();
    setOpen(open => !open);
  }
  function onActionClick(event, action) {
    event.stopPropagation();
    close();
    action();
  }
  useGlobalClick([dropdownRef.current], () => close());
  return jsxs("div", {
    class: classnames('bio-properties-panel-dropdown-button', {
      open
    }, className),
    onClick: onDropdownToggle,
    ref: dropdownRef,
    children: [children, jsx("div", {
      class: "bio-properties-panel-dropdown-button__menu",
      ref: menuRef,
      children: menuItems.map((item, index) => jsx(MenuItem, {
        onClick: onActionClick,
        item: item
      }, index))
    })]
  });
}
function MenuItem({
  item,
  onClick
}) {
  if (item.separator) {
    return jsx("div", {
      class: "bio-properties-panel-dropdown-button__menu-item bio-properties-panel-dropdown-button__menu-item--separator"
    });
  }
  if (item.action) {
    return jsx("button", {
      type: "button",
      class: "bio-properties-panel-dropdown-button__menu-item bio-properties-panel-dropdown-button__menu-item--actionable",
      onClick: event => onClick(event, item.action),
      children: item.entry
    });
  }
  return jsx("div", {
    class: "bio-properties-panel-dropdown-button__menu-item",
    children: item.entry
  });
}

/**
 *
 * @param {Array<null | Element>} ignoredElements
 * @param {Function} callback
 */
function useGlobalClick(ignoredElements, callback) {
  useEffect(() => {
    /**
     * @param {MouseEvent} event
     */
    function listener(event) {
      if (ignoredElements.some(element => element && element.contains(event.target))) {
        return;
      }
      callback();
    }
    document.addEventListener('click', listener, {
      capture: true
    });
    return () => document.removeEventListener('click', listener, {
      capture: true
    });
  }, [...ignoredElements, callback]);
}

function HeaderButton(props) {
  const {
    children = null,
    class: classname,
    onClick = () => {},
    ...otherProps
  } = props;
  return jsx("button", {
    type: "button",
    ...otherProps,
    onClick: onClick,
    class: classnames('bio-properties-panel-group-header-button', classname),
    children: children
  });
}

function CollapsibleEntry(props) {
  const {
    element,
    entries = [],
    id,
    label,
    open: shouldOpen,
    remove,
    translate = translateFallback
  } = props;
  const [open, setOpen] = useState(shouldOpen);
  const toggleOpen = () => setOpen(!open);
  const {
    onShow
  } = useContext(LayoutContext);
  const propertiesPanelContext = {
    ...useContext(LayoutContext),
    onShow: useCallback(() => {
      setOpen(true);
      if (isFunction(onShow)) {
        onShow();
      }
    }, [onShow, setOpen])
  };
  const placeholderLabel = translate('<empty>');
  const hasEntries = entries.length > 0;
  return jsxs("div", {
    "data-entry-id": id,
    class: classnames('bio-properties-panel-collapsible-entry', open ? 'open' : ''),
    children: [jsxs("div", {
      class: "bio-properties-panel-collapsible-entry-header",
      onClick: hasEntries ? toggleOpen : null,
      children: [jsx("div", {
        class: classnames('bio-properties-panel-collapsible-entry-header-title', !label && 'empty'),
        children: label || placeholderLabel
      }), hasEntries && jsx("button", {
        type: "button",
        title: translate('Toggle list item'),
        class: "bio-properties-panel-arrow  bio-properties-panel-collapsible-entry-arrow",
        children: jsx(Arrow, {
          class: open ? 'bio-properties-panel-arrow-down' : 'bio-properties-panel-arrow-right'
        })
      }), remove ? jsx("button", {
        type: "button",
        title: translate('Delete item'),
        class: "bio-properties-panel-remove-entry",
        onClick: remove,
        children: jsx(Delete, {})
      }) : null]
    }), jsx("div", {
      class: classnames('bio-properties-panel-collapsible-entry-entries', open ? 'open' : ''),
      children: jsx(LayoutContext.Provider, {
        value: propertiesPanelContext,
        children: entries.map(entry => {
          const {
            component: Component,
            id
          } = entry;
          return createElement$1(Component, {
            ...entry,
            element: element,
            key: id
          });
        })
      })
    })]
  });
}

/**
 * @param {import('../PropertiesPanel').ListItemDefinition} props
 */
function ListItem(props) {
  const {
    autoFocusEntry,
    autoOpen,
    translate = translateFallback
  } = props;

  // focus specified entry on auto open
  useEffect(() => {
    if (autoOpen && autoFocusEntry) {
      const entry = query(`[data-entry-id="${autoFocusEntry}"]`);
      const focusableInput = query('.bio-properties-panel-input', entry);
      if (focusableInput) {
        if (isFunction(focusableInput.select)) {
          focusableInput.select();
        } else if (isFunction(focusableInput.focus)) {
          focusableInput.focus();
        }
        focusableInput.scrollIntoView();
      }
    }
  }, [autoOpen, autoFocusEntry]);
  return jsx("div", {
    class: "bio-properties-panel-list-item",
    children: jsx(CollapsibleEntry, {
      ...props,
      open: autoOpen,
      translate: translate
    })
  });
}

const noop$6 = () => {};
const LIST_BADGE_SEVERITY_CLASS = {
  error: 'bio-properties-panel-list-badge--error',
  warning: 'bio-properties-panel-list-badge--warning'
};

/**
 * @param {import('../PropertiesPanel').ListGroupDefinition} props
 */
function ListGroup(props) {
  const {
    add,
    element,
    id,
    items,
    label,
    shouldOpen = false,
    translate = translateFallback
  } = props;
  useEffect(() => {
    if (props.shouldSort != undefined) {
      console.warn('the property \'shouldSort\' is no longer supported');
    }
  }, [props.shouldSort]);
  const groupRef = useRef(null);
  const [open, setOpen] = useLayoutState(['groups', id, 'open'], shouldOpen);
  const [sticky, setSticky] = useState(false);
  const onShow = useCallback(() => setOpen(true), [setOpen]);
  const [localItems, setLocalItems] = useState([]);

  // Flag to mark that add button was clicked in the last render cycle
  const [addTriggered, setAddTriggered] = useState(false);
  const prevElement = usePrevious(element);
  const toggleOpen = useCallback(() => setOpen(!open), [open]);
  const openItemIds = element === prevElement && open && addTriggered ? getNewItemIds(items, localItems) : [];

  // reset local state after items changed
  useEffect(() => {
    setLocalItems(items);
    setAddTriggered(false);
  }, [items]);

  // set css class when group is sticky to top
  useStickyIntersectionObserver(groupRef, 'div.bio-properties-panel-scroll-container', setSticky);
  const hasItems = !!items.length;
  const propertiesPanelContext = {
    ...useContext(LayoutContext),
    onShow
  };
  const handleAddClick = e => {
    setAddTriggered(true);
    setOpen(true);
    add(e);
  };
  const diagnostic = useListDiagnostic(items);
  return jsxs("div", {
    class: "bio-properties-panel-group",
    "data-group-id": 'group-' + id,
    ref: groupRef,
    children: [jsxs("div", {
      class: classnames('bio-properties-panel-group-header', hasItems ? '' : 'empty', hasItems && open ? 'open' : '', sticky && open ? 'sticky' : ''),
      onClick: hasItems ? toggleOpen : noop$6,
      children: [jsx("div", {
        class: "bio-properties-panel-group-header-title",
        children: jsx(TooltipWrapper, {
          value: props.tooltip,
          forId: 'group-' + id,
          element: element,
          children: label
        })
      }), jsxs("div", {
        class: "bio-properties-panel-group-header-buttons",
        children: [add ? jsxs("button", {
          type: "button",
          title: translate('Create new list item'),
          class: "bio-properties-panel-group-header-button bio-properties-panel-add-entry",
          onClick: handleAddClick,
          children: [jsx(Create, {}), !hasItems ? jsx("span", {
            class: "bio-properties-panel-add-entry-label",
            children: translate('Create')
          }) : null]
        }) : null, hasItems ? jsx("div", {
          title: translate(`List contains {numOfItems} item${items.length != 1 ? 's' : ''}`, {
            numOfItems: items.length
          }),
          class: classnames('bio-properties-panel-list-badge', LIST_BADGE_SEVERITY_CLASS[diagnostic?.severity]),
          children: items.length
        }) : null, hasItems ? jsx("button", {
          type: "button",
          title: translate('Toggle section'),
          class: "bio-properties-panel-group-header-button bio-properties-panel-arrow",
          children: jsx(Arrow, {
            class: open ? 'bio-properties-panel-arrow-down' : 'bio-properties-panel-arrow-right'
          })
        }) : null]
      })]
    }), jsx("div", {
      class: classnames('bio-properties-panel-list', open && hasItems ? 'open' : ''),
      children: jsx(LayoutContext.Provider, {
        value: propertiesPanelContext,
        children: items.map((item, index) => {
          if (!item) {
            return;
          }
          const {
            id
          } = item;

          // if item was added, open it
          // existing items will not be affected as autoOpen
          // is only applied on first render
          const autoOpen = openItemIds.includes(item.id);
          return createElement$1(ListItem, {
            ...item,
            autoOpen: autoOpen,
            element: element,
            index: index,
            key: id,
            translate: translate
          });
        })
      })
    })]
  });
}
function getNewItemIds(newItems, oldItems) {
  const newIds = newItems.map(item => item.id);
  const oldIds = oldItems.map(item => item.id);
  return newIds.filter(itemId => !oldIds.includes(itemId));
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.forId - id of the entry the description is used for
 * @param {String} props.value
 */
function Description(props) {
  const {
    element,
    forId,
    value
  } = props;
  const contextDescription = useDescriptionContext(forId, element);
  const description = value || contextDescription;
  if (description) {
    return jsx("div", {
      class: "bio-properties-panel-description",
      children: description
    });
  }
}

const SEVERITY_CLASS = {
  error: 'bio-properties-panel-error',
  warning: 'bio-properties-panel-warning',
  info: 'bio-properties-panel-info'
};

/**
 * @param {Object} props
 * @param {import('../util/diagnostics').Diagnostic} [props.diagnostic]
 * @param {String} props.forId - id of the entry the diagnostic belongs to
 * @param {Object} [props.element]
 */
function DiagnosticMessage(props) {
  const {
    diagnostic,
    forId,
    element
  } = props;
  if (!diagnostic) {
    return null;
  }
  const {
    action,
    message,
    severity
  } = diagnostic;
  return jsxs("div", {
    class: SEVERITY_CLASS[severity],
    children: [message && jsxs("span", {
      class: classnames('bio-properties-panel-error-message', 'bio-properties-panel-diagnostic-message'),
      children: [severity === 'info' && jsx(Info, {
        class: "bio-properties-panel-diagnostic-icon",
        "aria-hidden": "true"
      }), message]
    }), action && jsx(DiagnosticAction, {
      action: action,
      forId: forId,
      element: element
    })]
  });
}
function DiagnosticAction(props) {
  const {
    action,
    forId,
    element
  } = props;
  const buttonRef = useRef();

  // restore focus to the field once the focused action goes away
  useEffect(() => {
    return () => {
      const button = buttonRef.current;
      if (button && button === document.activeElement) {
        const field = document.getElementById(prefixId$a(forId));
        field && field.focus();
      }
    };
  }, [forId]);
  return jsx(TooltipWrapper, {
    value: action.tooltip,
    forId: `${forId}-diagnostic-action`,
    element: element,
    focusable: false,
    children: jsx("button", {
      type: "button",
      ref: buttonRef,
      id: prefixId$a(`${forId}-diagnostic-action`),
      class: classnames('bio-properties-panel-error-action', 'bio-properties-panel-diagnostic-action'),
      onClick: action.onClick,
      "aria-label": action.ariaLabel,
      "aria-describedby": action.tooltip ? TOOLTIP_ID : undefined,
      children: action.label
    })
  });
}

// helpers /////////////////

function prefixId$a(id) {
  return `bio-properties-panel-${id}`;
}

function Checkbox(props) {
  const {
    id,
    label,
    onChange,
    disabled,
    value = false,
    onFocus,
    onBlur,
    tooltip
  } = props;
  const [localValue, setLocalValue] = useState(value);
  const handleChangeCallback = ({
    target
  }) => {
    onChange(target.checked);
  };
  const handleChange = e => {
    handleChangeCallback(e);
    setLocalValue(e.target.value);
  };
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  const ref = useShowEntryEvent(id);
  return jsxs("div", {
    class: "bio-properties-panel-checkbox",
    children: [jsx("input", {
      ref: ref,
      id: prefixId$9(id),
      name: id,
      onFocus: onFocus,
      onBlur: onBlur,
      type: "checkbox",
      class: "bio-properties-panel-input",
      onChange: handleChange,
      checked: localValue,
      disabled: disabled
    }), jsx("label", {
      for: prefixId$9(id),
      class: "bio-properties-panel-label",
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: props.element,
        children: label
      })
    })]
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {string|import('preact').Component} props.tooltip
 * @param {boolean} [props.disabled]
 */
function CheckboxEntry(props) {
  const {
    element,
    id,
    description,
    label,
    getValue,
    setValue,
    disabled,
    onFocus,
    onBlur,
    tooltip
  } = props;
  const value = getValue(element);
  const diagnostic = useDisplayedDiagnostic(id);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', 'bio-properties-panel-checkbox-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(Checkbox, {
      disabled: disabled,
      id: id,
      label: label,
      onChange: setValue,
      onFocus: onFocus,
      onBlur: onBlur,
      value: value,
      tooltip: tooltip,
      element: element
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function isEdited$9(node) {
  return node && !!node.checked;
}

// helpers /////////////////

function prefixId$9(id) {
  return `bio-properties-panel-${id}`;
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.label
 * @param {Array<{label: String, value: *}>} props.options
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {String} [props.description]
 * @param {string|import('preact').Component} [props.tooltip]
 * @param {boolean} [props.disabled]
 * @param {Function} [props.onFocus]
 * @param {Function} [props.onBlur]
 */
function CheckboxGroup(props) {
  const {
    element,
    id,
    label,
    description,
    tooltip,
    options = [],
    getValue,
    setValue,
    disabled,
    onFocus,
    onBlur
  } = props;
  const value = getValue(element) || [];
  const handleOptionChange = (optionValue, checked) => {
    const newValue = checked ? [...value, optionValue] : value.filter(v => v !== optionValue);
    setValue(newValue);
  };
  return jsxs("div", {
    class: "bio-properties-panel-entry bio-properties-panel-checkbox-group",
    "data-entry-id": id,
    children: [jsx("div", {
      class: "bio-properties-panel-group-header",
      children: jsx("p", {
        class: "bio-properties-panel-label",
        children: jsx(TooltipWrapper, {
          value: tooltip,
          forId: id,
          element: element,
          children: label
        })
      })
    }), jsx("div", {
      class: "bio-properties-panel-checkbox-group-entries",
      children: options.map(option => jsx(CheckboxEntry, {
        id: `${id}-${option.value}`,
        label: option.label,
        setValue: checked => handleOptionChange(option.value, checked),
        getValue: () => value.includes(option.value),
        disabled: disabled,
        onFocus: onFocus,
        onBlur: onBlur,
        element: element
      }, option.value))
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}

const ExternalChange = Annotation.define();
const parseJsonLinter = jsonParseLinter();

/**
 * A CodeMirror based JSON editor for the properties panel.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {string} [props.value]
 * @param {Function} props.onInput
 * @param {boolean} [props.disabled]
 * @param {string} [props.placeholder]
 * @param {string} [props.tooltip]
 * @param {object} [props.element]
 */
function JsonEditor(props) {
  const {
    id,
    label,
    debounce,
    value = '',
    onInput: commitValue,
    disabled,
    placeholder: placeholder$1,
    tooltip,
    element
  } = props;
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const editorRef = useShowEntryEvent(id);
  const onInput = useStaticCallback(newValue => {
    commitValue(newValue === '' ? undefined : newValue);
  });
  const handleChange = useDebounce(onInput, debounce);
  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [highlightSpecialChars(), history(), drawSelection(), syntaxHighlighting(defaultHighlightStyle, {
          fallback: true
        }), foldGutter(), bracketMatching(), closeBrackets(), keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...foldKeymap]), EditorState.tabSize.of(2), EditorView.lineWrapping, EditorState.readOnly.of(!!disabled), ...(placeholder$1 ? [placeholder(placeholder$1)] : []), EditorView.updateListener.of(update => {
          const isExternal = update.transactions.some(tr => tr.annotation(ExternalChange));
          if (update.docChanged && !isExternal) {
            handleChange(update.state.doc.toString());
          }
        }), json(), linter(view => {
          const content = view.state.doc.toString();
          if (!content.trim()) return [];
          return parseJsonLinter(view);
        }, {
          delay: 300
        })]
      }),
      parent: containerRef.current
    });
    viewRef.current = view;

    // Allow useShowEntryEvent to focus the editor
    editorRef.current = view.contentDOM;
    const prefixedId = `bio-properties-panel-${id}`;
    view.contentDOM.setAttribute('id', prefixedId);
    view.contentDOM.setAttribute('aria-label', label);
    return () => {
      view.destroy();
    };
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (value === currentValue) return;
    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value || ''
      },
      annotations: ExternalChange.of(true)
    });
  }, [value]);

  // Focus editor on label click manually, as the native `for`
  // attribute does not work with contenteditable elements
  const focusEditor = () => {
    viewRef.current && viewRef.current.focus();
  };
  return jsxs("div", {
    class: "bio-properties-panel-json-editor",
    children: [jsx("label", {
      class: "bio-properties-panel-label",
      onClick: focusEditor,
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: element,
        children: label
      })
    }), jsx("div", {
      class: classnames('bio-properties-panel-input', value && 'edited'),
      ref: containerRef
    })]
  });
}

/**
 * Entry wrapper for JsonEditor, handles getValue/setValue, built-in JSON validation, error display, and description.
 *
 * @param {object} props
 * @param {object} props.element
 * @param {string} props.id
 * @param {string} [props.description]
 * @param {string} props.label
 * @param {Function} props.debounce
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {boolean} [props.disabled]
 * @param {string} [props.placeholder]
 * @param {string} [props.tooltip]
 * @param {import('../util/diagnostics').ValidateFunction} [props.validate]
 * @param {Function} [props.translate]
 */
function JsonEditorEntry(props) {
  const {
    element,
    id,
    description,
    debounce,
    label,
    getValue,
    setValue,
    disabled,
    placeholder,
    tooltip,
    validate,
    translate = translateFallback
  } = props;
  const diagnostics = useDiagnostics(id);
  let value = getValue(element);
  const [localDiagnostic, setLocalDiagnostic] = useState(() => computeDiagnostic(isFunction(validate) ? validate(value) : null, value, translate));
  const [editorValue, setEditorValue] = useState(value);
  useEffect(() => {
    if (value === editorValue) {
      return;
    }
    setEditorValue(value);
    setLocalDiagnostic(computeDiagnostic(isFunction(validate) ? validate(value) : null, value, translate));
  }, [value, validate]);
  const onInput = useStaticCallback(newValue => {
    setEditorValue(newValue);
    const currentValue = getValue(element);
    if (newValue !== currentValue) {
      const newValidationError = isFunction(validate) ? validate(newValue) : null;
      setValue(newValue, newValidationError);
      setLocalDiagnostic(computeDiagnostic(newValidationError, newValue, translate));
    }
  });

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, localDiagnostic]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(JsonEditor, {
      id: id,
      label: label,
      debounce: debounce,
      value: value,
      onInput: onInput,
      disabled: disabled,
      placeholder: placeholder,
      tooltip: tooltip,
      element: element
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}

/**
 * Check if the JSON editor entry has been edited.
 */
function isEdited$8(node) {
  return node && node.classList.contains('edited');
}

// helpers /////////////////

function computeDiagnostic(custom, value, translate) {
  const builtIn = validateJson(value, translate);

  // rank both local checks, so a custom warning cannot mask a built-in JSON syntax error
  return getMostSevere([custom, builtIn]);
}
function validateJson(value, translate = translateFallback) {
  if (!value || !value.trim()) return null;
  try {
    return isObject(JSON.parse(value)) ? null : translate('JSON contains errors');
  } catch (e) {
    return translate('JSON contains errors');
  }
}

/**
 * Button to open popups.
 *
 * @param {Object} props
 * @param {Function} props.onClick - Callback to trigger when the button is clicked.
 * @param {string} [props.title] - Tooltip text for the button.
 * @param {Function} [props.translate] - Translation function for built-in strings.
 */
function OpenPopupButton({
  onClick,
  title,
  translate = translateFallback
}) {
  title = title ?? translate('Open pop-up editor');
  return jsx("button", {
    type: "button",
    title: title,
    class: 'bio-properties-panel-open-feel-popup',
    onClick: onClick,
    children: jsx(OpenPopup, {})
  });
}

const noop$5 = () => {};

/**
 * Buffer `.focus()` calls while the editor is not initialized.
 * Set Focus inside when the editor is ready.
 */
const useBufferedFocus$1 = function (editor, ref) {
  const [buffer, setBuffer] = useState(undefined);
  ref.current = useMemo(() => ({
    focus: offset => {
      if (editor) {
        editor.focus(offset);
      } else {
        if (typeof offset === 'undefined') {
          offset = Infinity;
        }
        setBuffer(offset);
      }
    }
  }), [editor]);
  useEffect(() => {
    if (typeof buffer !== 'undefined' && editor) {
      editor.focus(buffer);
      setBuffer(false);
    }
  }, [editor, buffer]);
};
const TemplatingEditor = forwardRef((props, ref) => {
  const {
    onInput,
    disabled,
    tooltipContainer,
    enableGutters,
    value,
    onLint = noop$5,
    onOpenPopup = noop$5,
    popupOpen,
    contentAttributes = {},
    hostLanguage = null,
    singleLine = false
  } = props;
  const inputRef = useRef();
  const [editor, setEditor] = useState();
  const [localValue, setLocalValue] = useState(value || '');
  useBufferedFocus$1(editor, ref);
  const handleInput = useStaticCallback(newValue => {
    onInput(newValue);
    setLocalValue(newValue);
  });
  useEffect(() => {
    let editor;
    editor = new FeelersEditor({
      container: inputRef.current,
      onChange: handleInput,
      value: localValue,
      onLint,
      contentAttributes,
      tooltipContainer,
      enableGutters,
      hostLanguage,
      singleLine,
      lineWrap: true
    });
    setEditor(editor);
    return () => {
      onLint([]);
      inputRef.current.innerHTML = '';
      setEditor(null);
    };
  }, []);
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (value === localValue) {
      return;
    }
    editor.setValue(value);
    setLocalValue(value);
  }, [value]);
  const handleClick = () => {
    ref.current.focus();
  };
  return jsxs("div", {
    class: classnames('bio-properties-panel-feelers-editor-container', popupOpen ? 'popupOpen' : null),
    children: [popupOpen && jsx("div", {
      class: "bio-properties-panel-feelers-editor__popup-placeholder",
      children: "Opened in popup"
    }), jsx("div", {
      name: props.name,
      class: classnames('bio-properties-panel-feelers-editor bio-properties-panel-input', localValue ? 'edited' : null, disabled ? 'disabled' : null),
      ref: inputRef,
      onClick: handleClick
    }), !disabled && jsx(OpenPopupButton, {
      onClick: () => onOpenPopup('feelers')
    })]
  });
});

const noop$4 = () => {};

/**
 * Buffer `.focus()` calls while the editor is not initialized.
 * Set Focus inside when the editor is ready.
 */
const useBufferedFocus = function (editor, ref) {
  const [buffer, setBuffer] = useState(undefined);
  ref.current = useMemo(() => ({
    focus: offset => {
      if (editor) {
        editor.focus(offset);
      } else {
        if (typeof offset === 'undefined') {
          offset = Infinity;
        }
        setBuffer(offset);
      }
    }
  }), [editor]);
  useEffect(() => {
    if (typeof buffer !== 'undefined' && editor) {
      editor.focus(buffer);
      setBuffer(false);
    }
  }, [editor, buffer]);
};
const FeelEditor = forwardRef((props, ref) => {
  const {
    contentAttributes,
    enableGutters,
    value,
    onInput,
    onKeyDown: onKeyDownProp = noop$4,
    onBlur = noop$4,
    onFeelToggle = noop$4,
    onLint = noop$4,
    onOpenPopup = noop$4,
    placeholder,
    popupOpen,
    disabled,
    tooltipContainer,
    variables,
    feelLanguageContext,
    translate = translateFallback
  } = props;
  const inputRef = useRef();
  const [editor, setEditor] = useState();
  const [localValue, setLocalValue] = useState(value || '');
  const {
    builtins,
    dialect,
    parserDialect,
    engines
  } = feelLanguageContext || {};
  useBufferedFocus(editor, ref);
  const handleInput = useStaticCallback(newValue => {
    onInput(newValue);
    setLocalValue(newValue);
  });
  const handleBlur = useStaticCallback(() => {
    onBlur();
  });
  useEffect(() => {
    let editor;

    /* Trigger FEEL toggle when
     *
     * - `backspace` is pressed
     * - AND the cursor is at the beginning of the input
     */
    const onKeyDown = e => {
      // Call parent onKeyDown handler first
      onKeyDownProp(e);
      if (e.key !== 'Backspace' || !editor) {
        return;
      }
      const selection = editor.getSelection();
      const range = selection.ranges[selection.mainIndex];
      if (range.from === 0 && range.to === 0) {
        onFeelToggle();
      }
    };
    editor = new Editor({
      container: inputRef.current,
      onChange: handleInput,
      onKeyDown: onKeyDown,
      onLint: onLint,
      placeholder: placeholder,
      readOnly: disabled,
      tooltipContainer: tooltipContainer,
      value: localValue,
      variables,
      builtins,
      dialect,
      parserDialect,
      engines,
      extensions: [...(enableGutters ? [lineNumbers()] : []), EditorView.lineWrapping, EditorView.domEventHandlers({
        blur: handleBlur
      })],
      contentAttributes
    });
    setEditor(editor);
    return () => {
      onLint([]);
      inputRef.current.innerHTML = '';
      setEditor(null);
    };
  }, []);
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (value === localValue) {
      return;
    }
    editor.setValue(value);
    setLocalValue(value);
  }, [value]);
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setVariables(variables);
  }, [variables]);
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setPlaceholder(placeholder);
  }, [placeholder]);
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEngines(engines);
  }, [engines]);
  const handleClick = () => {
    ref.current.focus();
  };
  return jsxs("div", {
    class: classnames('bio-properties-panel-feel-editor-container', disabled ? 'disabled' : null, popupOpen ? 'popupOpen' : null),
    children: [popupOpen && jsx("div", {
      class: "bio-properties-panel-feel-editor__open-popup-placeholder",
      children: translate('Opened in editor')
    }), jsx("div", {
      name: props.name,
      class: classnames('bio-properties-panel-input', localValue ? 'edited' : null),
      ref: inputRef,
      onClick: handleClick
    }), !disabled && jsx(OpenPopupButton, {
      onClick: () => onOpenPopup('feel'),
      translate: translate
    })]
  });
});

function FeelIndicator(props) {
  const {
    active
  } = props;
  if (!active) {
    return null;
  }
  return jsx("span", {
    class: "bio-properties-panel-feel-indicator",
    children: "="
  });
}

const noop$3 = () => {};

/**
 * @param {Object} props
 * @param {Object} props.label
 * @param {String} props.feel
 * @param {boolean} props.active
 * @param {boolean} props.disabled
 * @param {Function} props.onClick
 * @param {Function} props.translate
 * @returns {import('preact').Component}
 */
function FeelIcon(props) {
  const {
    feel = false,
    active,
    disabled = false,
    onClick = noop$3,
    translate = translateFallback
  } = props;
  const feelRequiredLabel = translate('FEEL expression is mandatory');
  const feelOptionalLabel = translate(`Click to ${active ? 'remove' : 'set a'} dynamic value with FEEL expression`);
  const handleClick = e => {
    onClick(e);

    // when pointer event was created from keyboard, keep focus on button
    if (!e.pointerType) {
      e.stopPropagation();
    }
  };
  return jsx("button", {
    type: "button",
    class: classnames('bio-properties-panel-feel-icon', active ? 'active' : null, feel === 'required' ? 'required' : 'optional'),
    onClick: handleClick,
    disabled: feel === 'required' || disabled,
    title: feel === 'required' ? feelRequiredLabel : feelOptionalLabel,
    children: jsx(Feel, {})
  });
}

/**
 * @param {KeyboardEvent} event
 * @return {boolean}
 */
function isCmd(event) {
  // ensure we don't react to AltGr
  // (mapped to CTRL + ALT)
  if (event.altKey) {
    return false;
  }
  return event.ctrlKey || event.metaKey;
}
function isCmdWithChar(event) {
  return isCmd(event) && event.key.length === 1 && /^[a-zA-Z]$/.test(event.key);
}

function ToggleSwitch(props) {
  const {
    id,
    label,
    onInput,
    value,
    switcherLabel,
    inline,
    onFocus,
    onBlur,
    inputRef,
    tooltip
  } = props;
  const [localValue, setLocalValue] = useState(value);
  const handleInputCallback = async () => {
    onInput(!value);
  };
  const handleInput = e => {
    handleInputCallback();
    setLocalValue(e.target.value);
  };
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-toggle-switch', {
      inline
    }),
    children: [jsx("label", {
      class: "bio-properties-panel-label",
      for: prefixId$8(id),
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: props.element,
        children: label
      })
    }), jsxs("div", {
      class: "bio-properties-panel-field-wrapper",
      children: [jsxs("label", {
        class: "bio-properties-panel-toggle-switch__switcher",
        children: [jsx("input", {
          ref: inputRef,
          id: prefixId$8(id),
          class: "bio-properties-panel-input",
          type: "checkbox",
          onFocus: onFocus,
          onBlur: onBlur,
          name: id,
          onInput: handleInput,
          checked: !!localValue
        }), jsx("span", {
          class: "bio-properties-panel-toggle-switch__slider"
        })]
      }), switcherLabel && jsx("p", {
        class: "bio-properties-panel-toggle-switch__label",
        children: switcherLabel
      })]
    })]
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {String} props.label
 * @param {String} props.switcherLabel
 * @param {Boolean} props.inline
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {string|import('preact').Component} props.tooltip
 */
function ToggleSwitchEntry(props) {
  const {
    element,
    id,
    description,
    label,
    switcherLabel,
    inline,
    getValue,
    setValue,
    onFocus,
    onBlur,
    tooltip
  } = props;
  const value = getValue(element);
  return jsxs("div", {
    class: "bio-properties-panel-entry bio-properties-panel-toggle-switch-entry",
    "data-entry-id": id,
    children: [jsx(ToggleSwitch, {
      id: id,
      label: label,
      value: value,
      onInput: setValue,
      onFocus: onFocus,
      onBlur: onBlur,
      switcherLabel: switcherLabel,
      inline: inline,
      tooltip: tooltip,
      element: element
    }, element), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function isEdited$7(node) {
  return node && !!node.checked;
}

// helpers /////////////////

function prefixId$8(id) {
  return `bio-properties-panel-${id}`;
}

function NumberField(props) {
  const {
    debounce,
    disabled,
    displayLabel = true,
    id,
    inputRef,
    label,
    max,
    min,
    onInput,
    step,
    value = '',
    onFocus,
    onBlur,
    onKeyDown,
    tooltip
  } = props;
  const [localValue, setLocalValue] = useState(value);
  const handleInputCallback = useMemo(() => {
    return debounce(target => {
      if (target.validity.valid) {
        onInput(target.value ? parseFloat(target.value) : undefined);
      }
    });
  }, [onInput, debounce]);
  const handleInput = e => {
    handleInputCallback(e.target);
    setLocalValue(e.target.value);
  };
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  return jsxs("div", {
    class: "bio-properties-panel-numberfield",
    children: [displayLabel && jsx("label", {
      for: prefixId$7(id),
      class: "bio-properties-panel-label",
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: props.element,
        children: label
      })
    }), jsx("input", {
      id: prefixId$7(id),
      ref: inputRef,
      type: "number",
      name: id,
      spellCheck: "false",
      autoComplete: "off",
      disabled: disabled,
      class: "bio-properties-panel-input",
      max: max,
      min: min,
      onInput: handleInput,
      onFocus: onFocus,
      onBlur: onBlur,
      onKeyDown: onKeyDown,
      step: step,
      value: localValue
    })]
  });
}

/**
 * @param {Object} props
 * @param {Boolean} props.debounce
 * @param {String} props.description
 * @param {Boolean} props.disabled
 * @param {Object} props.element
 * @param {Function} props.getValue
 * @param {String} props.id
 * @param {String} props.label
 * @param {String} props.max
 * @param {String} props.min
 * @param {Function} props.setValue
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {String} props.step
 * @param {import('../util/diagnostics').ValidateFunction} props.validate
 */
function NumberFieldEntry(props) {
  const {
    debounce,
    description,
    disabled,
    element,
    getValue,
    id,
    label,
    max,
    min,
    setValue,
    step,
    onFocus,
    onBlur,
    validate,
    tooltip
  } = props;
  const diagnostics = useDiagnostics(id);
  const [localDiagnostic, setLocalDiagnostic] = useState(null);
  let value = getValue(element);
  useEffect(() => {
    if (isFunction(validate)) {
      const newValidationError = validate(value) || null;
      setLocalDiagnostic(newValidationError);
    }
  }, [value, validate]);
  const onInput = newValue => {
    if (newValue !== value) {
      let newValidationError = null;
      if (isFunction(validate)) {
        newValidationError = validate(newValue) || null;
      }
      setValue(newValue, newValidationError);
      setLocalDiagnostic(newValidationError);
    }
  };

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, localDiagnostic]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(NumberField, {
      debounce: debounce,
      disabled: disabled,
      id: id,
      label: label,
      onFocus: onFocus,
      onBlur: onBlur,
      onInput: onInput,
      max: max,
      min: min,
      step: step,
      value: value,
      tooltip: tooltip
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function isEdited$6(node) {
  return node && !!node.value;
}

// helpers /////////////////

function prefixId$7(id) {
  return `bio-properties-panel-${id}`;
}

const noop$2 = () => {};

/**
 * @typedef {'required'|'optional'|'optional-default-enabled'|'static'} FeelType
 */

/**
 * @param {Object} props
 * @param {Boolean} props.debounce
 * @param {String} props.id
 * @param {Object} props.element
 * @param {String} props.label
 * @param {String} props.hostLanguage
 * @param {Function} props.onInput
 * @param {Function} props.onBlur
 * @param {Function} props.onError
 * @param {FeelType} [props.feel]
 * @param {String} props.value
 * @param {Boolean} [props.singleLine]
 * @param {Function} props.tooltipContainer
 * @param {Function | import('preact').Component} props.OptionalComponent
 * @param {Boolean} props.disabled
 * @param {Array} props.variables
 * @param {string} [props.placeholder]
 * @param {string | import('preact').Component} props.tooltip
 * @param {Function} props.translate
 */
function FeelTextfield(props) {
  const {
    debounce,
    id,
    element,
    label,
    hostLanguage,
    onInput: commitValue,
    onBlur,
    onError,
    placeholder,
    feel,
    value = '',
    disabled = false,
    variables,
    singleLine,
    tooltipContainer,
    OptionalComponent = OptionalFeelInput,
    tooltip,
    translate
  } = props;
  const [localValue, setLocalValue] = useState(getInitialFeelLocalValue(feel, value));
  const editorRef = useShowEntryEvent(id);
  const containerRef = useRef();
  const onInput = useCallback(newValue => {
    // we don't commit empty FEEL expressions,
    // but instead serialize them as <undefined>
    const newModelValue = newValue === '' || newValue === '=' ? undefined : newValue;
    commitValue(newModelValue);
  }, [commitValue]);
  const feelActive = isFeelActive(feel, localValue);
  const feelOnlyValue = getFeelValue(localValue);
  const feelLanguageContext = useContext(FeelLanguageContext);
  const [focus, _setFocus] = useState(undefined);
  const {
    eventBus
  } = useContext(EventContext);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const setFocus = (offset = 0) => {
    const hasFocus = containerRef.current.contains(document.activeElement);

    // Keep caret position if it is already focused, otherwise focus at the end
    const position = hasFocus ? document.activeElement.selectionStart : Infinity;
    _setFocus(position + offset);
  };

  /**
   * @type { import('min-dash').DebouncedFunction }
   */
  const handleInput = useDebounce(onInput, debounce);
  const setAndCommitValue = newValue => {
    // cancel any pending debounced value
    handleInput.cancel?.();
    setLocalValue(newValue);
    onInput(newValue);
  };
  const handleFeelToggle = useStaticCallback(() => {
    if (feel === 'required') {
      return;
    }
    if (!feelActive) {
      setAndCommitValue('=' + localValue);
    } else {
      setAndCommitValue(feelOnlyValue);
    }
  });
  const handleInputChange = newValue => {
    if (feelActive) {
      newValue = '=' + newValue;
    }
    if (newValue === localValue) {
      return;
    }
    setLocalValue(newValue);
    handleInput(newValue);
    if (!feelActive && isString(newValue) && newValue.startsWith('=')) {
      // focus is behind `=` sign that will be removed
      setFocus(-1);
    }
  };
  const handleOptionalInputOnBlur = e => {
    if (e.target.type === 'checkbox') {
      setAndCommitValue(e.target.checked);
    } else {
      const trimmedValue = e.target.value.trim();
      if (trimmedValue !== localValue) {
        // Trim changed the value — commit trimmed
        setAndCommitValue(trimmedValue);
      } else {
        // Value unchanged — flush any pending debounce
        handleInput.flush?.();
      }
    }
    if (onBlur) {
      onBlur(e);
    }
  };
  const handleFeelEditorOnBlur = () => {
    handleInput.flush?.();
  };
  const handleOnKeyDown = e => {
    // number inputs do not accept `=`, convert to FEEL explicitly
    // if the field is empty; caret position is not exposed for number inputs
    const isCommand = (e.ctrlKey || e.metaKey) && !e.getModifierState?.('AltGraph');
    if (e.key === '=' && !isCommand && !feelActive && isFeelOptional(feel) && !disabled && e.target.type === 'number' && !e.target.value) {
      e.preventDefault();
      handleFeelToggle();

      // number inputs expose no caret position
      _setFocus(Infinity);
      return;
    }
    if (isCmdWithChar(e)) {
      handleInput.flush?.();
    }
  };
  const handleLint = useStaticCallback((lint = []) => {
    const syntaxError = lint.some(report => report.type === 'Syntax Error');
    if (syntaxError) {
      onError(translate('Unparsable FEEL expression.'));
    } else {
      onError(undefined);
    }
  });

  // changes made in the popup are applied once, when it closes
  const applyPopupDraft = useStaticCallback(draft => {
    const newValue = feelActive ? '=' + draft : draft;
    if (newValue !== localValue) {
      setAndCommitValue(newValue);
    }
  });
  const handleOpenPopup = (type = 'feel') => {
    let draft;
    const isOpen = eventBus.fire('propertiesPanel.openPopup', {
      element,
      entryId: id,
      hostLanguage,
      label,
      onInput: newValue => {
        draft = newValue;
      },
      singleLine,
      sourceElement: editorRef.current,
      tooltipContainer,
      type,
      value: feelOnlyValue,
      variables,
      feelLanguageContext
    });
    if (isOpen) {
      eventBus.once('propertiesPanelPopup.close', () => {
        if (draft !== undefined) {
          applyPopupDraft(draft);
        }
        setIsPopupOpen(false);
      });
    }
    setIsPopupOpen(isOpen === true);
  };
  useEffect(() => {
    if (typeof focus !== 'undefined') {
      editorRef.current.focus(focus);
      _setFocus(undefined);
    }
  }, [focus]);
  useEffect(() => {
    if (value === localValue) {
      return;
    }

    // External value change removed content => keep FEEL configuration
    if (!value) {
      setLocalValue(feelActive ? '=' : '');
      return;
    }
    setLocalValue(value);
  }, [value]);
  useEffect(() => {
    return () => {
      eventBus.fire('propertiesPanel.closePopup');
    };
  }, []);

  // copy-paste integration
  useEffect(() => {
    const copyHandler = event => {
      if (!feelActive) {
        return;
      }
      event.clipboardData.setData('application/FEEL', event.clipboardData.getData('text'));
    };
    const pasteHandler = event => {
      if (feelActive || isPopupOpen) {
        return;
      }
      const feelData = event.clipboardData.getData('application/FEEL');
      if (feelData) {
        setTimeout(() => {
          handleFeelToggle();
          setFocus();
        });
        return;
      }
      const target = event.target;

      // Skip for non-input/textArea elements (e.g. CodeMirror contenteditable)
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
        return;
      }
      const isFieldEmpty = !target.value;
      const isAllSelected = target.selectionStart === 0 && target.selectionEnd === target.value.length;
      if (isFieldEmpty || isAllSelected) {
        const textData = event.clipboardData.getData('text');
        const trimmedValue = textData.trim();
        setAndCommitValue(trimmedValue);
        if (!feelActive && isString(trimmedValue) && trimmedValue.startsWith('=')) {
          setFocus(trimmedValue.length - 1);
        }
        event.preventDefault();
      }
    };
    containerRef.current.addEventListener('copy', copyHandler);
    containerRef.current.addEventListener('cut', copyHandler);
    containerRef.current.addEventListener('paste', pasteHandler);
    return () => {
      containerRef.current.removeEventListener('copy', copyHandler);
      containerRef.current.removeEventListener('cut', copyHandler);
      containerRef.current.removeEventListener('paste', pasteHandler);
    };
  }, [containerRef, feelActive, handleFeelToggle, setFocus]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-feel-entry', {
      'feel-active': feelActive
    }),
    children: [jsxs("label", {
      for: prefixId$6(id),
      class: "bio-properties-panel-label",
      onClick: () => setFocus(),
      children: [jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: props.element,
        children: label
      }), jsx(FeelIcon, {
        label: label,
        feel: feel,
        onClick: handleFeelToggle,
        active: feelActive,
        translate: translate
      })]
    }), jsxs("div", {
      class: "bio-properties-panel-feel-container",
      ref: containerRef,
      children: [jsx(FeelIndicator, {
        active: feelActive,
        disabled: !isFeelOptional(feel) || disabled,
        onClick: handleFeelToggle
      }), feelActive ? jsx(FeelEditor, {
        name: id,
        onInput: handleInputChange,
        onBlur: handleFeelEditorOnBlur,
        onKeyDown: handleOnKeyDown,
        contentAttributes: {
          'id': prefixId$6(id),
          'aria-label': label
        },
        disabled: disabled,
        popupOpen: isPopupOpen,
        onFeelToggle: () => {
          handleFeelToggle();
          setFocus(true);
        },
        onLint: handleLint,
        onOpenPopup: handleOpenPopup,
        placeholder: placeholder,
        value: feelOnlyValue,
        variables: variables,
        feelLanguageContext: feelLanguageContext,
        ref: editorRef,
        tooltipContainer: tooltipContainer,
        translate: translate
      }) : jsx(OptionalComponent, {
        ...props,
        popupOpen: isPopupOpen,
        onInput: handleInputChange,
        onKeyDown: handleOnKeyDown,
        onBlur: handleOptionalInputOnBlur,
        contentAttributes: {
          'id': prefixId$6(id),
          'aria-label': label
        },
        value: localValue,
        ref: editorRef,
        onOpenPopup: handleOpenPopup,
        containerRef: containerRef
      })]
    })]
  });
}
const OptionalFeelInput = forwardRef((props, ref) => {
  const {
    id,
    disabled,
    onInput,
    onKeyDown,
    value,
    onFocus,
    onBlur,
    placeholder
  } = props;
  const inputRef = useRef();

  // To be consistent with the FEEL editor, set focus at start of input
  // this ensures clean editing experience when switching with the keyboard
  ref.current = {
    focus: position => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      if (typeof position === 'number') {
        if (position > value.length) {
          position = value.length;
        }
        input.setSelectionRange(position, position);
      }
    }
  };
  return jsx("input", {
    id: prefixId$6(id),
    type: "text",
    ref: inputRef,
    name: id,
    spellCheck: "false",
    autoComplete: "off",
    disabled: disabled,
    class: "bio-properties-panel-input",
    onInput: e => onInput(e.target.value),
    onFocus: onFocus,
    onKeyDown: onKeyDown,
    onBlur: onBlur,
    placeholder: placeholder,
    value: value || ''
  });
});
const OptionalFeelNumberField = forwardRef((props, ref) => {
  const {
    id,
    debounce,
    disabled,
    onInput,
    value,
    min,
    max,
    step,
    onFocus,
    onBlur,
    onKeyDown
  } = props;
  const inputRef = useRef();

  // Number inputs do not support selection ranges,
  // so the focus position is ignored and the input is only focused
  ref.current = {
    focus: () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
    }
  };
  return jsx(NumberField, {
    id: id,
    debounce: debounce,
    disabled: disabled,
    displayLabel: false,
    inputRef: inputRef,
    max: max,
    min: min,
    onInput: onInput,
    step: step,
    value: value,
    onFocus: onFocus,
    onBlur: onBlur,
    onKeyDown: onKeyDown
  });
});
const OptionalFeelTextArea = forwardRef((props, ref) => {
  const {
    id,
    disabled,
    onInput,
    value,
    onFocus,
    onBlur,
    placeholder
  } = props;
  const inputRef = useRef();

  // To be consistent with the FEEL editor, set focus at start of input
  // this ensures clean editing experience when switching with the keyboard
  ref.current = {
    focus: () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.setSelectionRange(0, 0);
    }
  };
  return jsx("textarea", {
    id: prefixId$6(id),
    type: "text",
    ref: inputRef,
    name: id,
    spellCheck: "false",
    autoComplete: "off",
    disabled: disabled,
    class: "bio-properties-panel-input",
    onInput: e => onInput(e.target.value),
    onFocus: onFocus,
    onBlur: onBlur,
    placeholder: placeholder,
    value: value || '',
    "data-gramm": "false"
  });
});
const OptionalFeelToggleSwitch = forwardRef((props, ref) => {
  const {
    id,
    onInput,
    value,
    onFocus,
    onBlur,
    switcherLabel
  } = props;
  const inputRef = useRef();

  // To be consistent with the FEEL editor, set focus at start of input
  // this ensures clean editing experience when switching with the keyboard
  ref.current = {
    focus: () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
    }
  };
  return jsx(ToggleSwitch, {
    id: id,
    value: value,
    inputRef: inputRef,
    onInput: onInput,
    onFocus: onFocus,
    onBlur: onBlur,
    switcherLabel: switcherLabel
  });
});
const OptionalFeelCheckbox = forwardRef((props, ref) => {
  const {
    id,
    disabled,
    onInput,
    value,
    onFocus,
    onBlur
  } = props;
  const inputRef = useRef();
  const handleChange = ({
    target
  }) => {
    onInput(target.checked);
  };

  // To be consistent with the FEEL editor, set focus at start of input
  // this ensures clean editing experience when switching with the keyboard
  ref.current = {
    focus: () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
    }
  };
  return jsx("input", {
    ref: inputRef,
    id: prefixId$6(id),
    name: id,
    onFocus: onFocus,
    onBlur: onBlur,
    type: "checkbox",
    class: "bio-properties-panel-input",
    onChange: handleChange,
    checked: value,
    disabled: disabled
  });
});

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {FeelType} [props.feel]
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 * @param {Function} props.example
 * @param {Array} props.variables
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {string} [props.placeholder]
 * @param {string|import('preact').Component} props.tooltip
 */
function FeelEntry(props) {
  const {
    element,
    id,
    description,
    debounce,
    disabled,
    feel,
    label,
    getValue,
    setValue,
    tooltipContainer,
    hostLanguage,
    singleLine,
    validate,
    show = noop$2,
    example,
    variables,
    onFocus,
    onBlur,
    placeholder,
    tooltip,
    translate = translateFallback
  } = props;
  const [validationDiagnostic, setValidationDiagnostic] = useState(null);
  const [lintDiagnostic, setLintDiagnostic] = useState(null);
  let value = getValue(element);
  useEffect(() => {
    if (isFunction(validate)) {
      const newValidationError = validate(value) || null;
      setValidationDiagnostic(newValidationError);
    }
  }, [value, validate]);
  const onInput = useStaticCallback(newValue => {
    const value = getValue(element);

    // don't create multiple commandStack entries and do validation for the same value
    if (newValue !== value) {
      let newValidationError = null;
      if (isFunction(validate)) {
        newValidationError = validate(newValue) || null;
      }
      setValue(newValue, newValidationError);
      setValidationDiagnostic(newValidationError);
    }
  });
  const onError = useCallback(err => {
    setLintDiagnostic(err);
  }, []);
  const diagnostics = useDiagnostics(id);

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, lintDiagnostic, validationDiagnostic]);
  return jsxs("div", {
    class: classnames(props.class, 'bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [createElement$1(FeelTextfield, {
      ...props,
      debounce: debounce,
      disabled: disabled,
      feel: feel,
      id: id,
      key: element,
      label: label,
      onInput: onInput,
      onError: onError,
      onFocus: onFocus,
      onBlur: onBlur,
      placeholder: placeholder,
      example: example,
      hostLanguage: hostLanguage,
      singleLine: singleLine,
      show: show,
      translate: translate,
      value: value,
      variables: variables,
      tooltipContainer: tooltipContainer,
      OptionalComponent: props.OptionalComponent,
      tooltip: tooltip
    }), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {String} props.max
 * @param {String} props.min
 * @param {String} props.step
 * @param {FeelType} [props.feel]
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 * @param {Function} props.example
 * @param {Array} props.variables
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 */
function FeelNumberEntry(props) {
  return jsx(FeelEntry, {
    class: "bio-properties-panel-feel-number",
    OptionalComponent: OptionalFeelNumberField,
    ...props
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {FeelType} [props.feel]
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 * @param {Function} props.example
 * @param {Array} props.variables
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {string} [props.placeholder]
 */
function FeelTextAreaEntry(props) {
  return jsx(FeelEntry, {
    class: "bio-properties-panel-feel-textarea",
    OptionalComponent: OptionalFeelTextArea,
    ...props
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {FeelType} [props.feel]
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 * @param {Function} props.example
 * @param {Array} props.variables
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 */
function FeelToggleSwitchEntry(props) {
  return jsx(FeelEntry, {
    class: "bio-properties-panel-feel-toggle-switch",
    OptionalComponent: OptionalFeelToggleSwitch,
    ...props
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {FeelType} [props.feel]
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 * @param {Function} props.example
 * @param {Array} props.variables
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 */
function FeelCheckboxEntry(props) {
  return jsx(FeelEntry, {
    class: "bio-properties-panel-feel-checkbox",
    OptionalComponent: OptionalFeelCheckbox,
    ...props
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {String} props.hostLanguage
 * @param {Boolean} props.singleLine
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {FeelType} [props.feel]
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 * @param {Function} props.example
 * @param {Array} props.variables
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 */
function FeelTemplatingEntry(props) {
  return jsx(FeelEntry, {
    class: "bio-properties-panel-feel-templating",
    OptionalComponent: TemplatingEditor,
    ...props
  });
}
function isEdited$5(node) {
  if (!node) {
    return false;
  }
  if (node.type === 'checkbox') {
    return !!node.checked || node.classList.contains('edited');
  }
  return !!node.value || node.classList.contains('edited');
}

// helpers /////////////////

function prefixId$6(id) {
  return `bio-properties-panel-${id}`;
}

/**
 * Determine if FEEL is optional for the configured {@link FeelType}.
 *
 * @param {FeelType} feelType
 *
 * @return {boolean}
 */
function isFeelOptional(feelType) {
  return feelType === 'optional' || feelType === 'optional-default-enabled';
}

/**
 * Determine if FEEL editing is currently active.
 *
 * @param {FeelType} feelType
 * @param {string} localValue
 *
 * @return {boolean}
 */
function isFeelActive(feelType, localValue) {
  if (feelType === 'required') {
    return true;
  }
  if (isString(localValue)) {
    if (localValue.startsWith('=')) {
      return true;
    }
  }
  return false;
}

/**
 * @template T
 * @param {T} value
 *
 * @return {string|T}
 */
function getFeelValue(value) {
  if (isString(value) && value.startsWith('=')) {
    return value.substring(1);
  }
  return value;
}

/**
 * Initialize local FEEL value.
 *
 * `optional-default-enabled` starts in FEEL mode if no value or empty string is provided.
 *
 * @template T
 * @param {FeelType} feelType
 * @param {T} value
 *
 * @return {string|T}
 */
function getInitialFeelLocalValue(feelType, value) {
  if (feelType === 'optional-default-enabled' && (value === undefined || value === '')) {
    return '=';
  }
  return value;
}

const noop$1 = () => {};

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.tooltipContainer
 * @param {import('../../util/diagnostics').ValidateFunction} props.validate
 * @param {Function} props.show
 */
function TemplatingEntry(props) {
  const {
    element,
    id,
    description,
    debounce,
    disabled,
    label,
    getValue,
    setValue,
    tooltipContainer,
    validate,
    show = noop$1
  } = props;
  const [validationDiagnostic, setValidationDiagnostic] = useState(null);
  const [lintDiagnostic, setLintDiagnostic] = useState(null);
  let value = getValue(element);
  useEffect(() => {
    if (isFunction(validate)) {
      const newValidationError = validate(value) || null;
      setValidationDiagnostic(newValidationError);
    }
  }, [value, validate]);
  const onInput = useStaticCallback(newValue => {
    let newValidationError = null;
    if (isFunction(validate)) {
      newValidationError = validate(newValue) || null;
    }

    // don't create multiple commandStack entries for the same value
    if (newValue !== value) {
      setValue(newValue, newValidationError);
    }
    setValidationDiagnostic(newValidationError);
  });
  const onError = useCallback(err => {
    setLintDiagnostic(err);
  }, []);
  const diagnostics = useDiagnostics(id);

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, lintDiagnostic, validationDiagnostic]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(Templating, {
      debounce: debounce,
      disabled: disabled,
      id: id,
      label: label,
      onInput: onInput,
      onError: onError,
      show: show,
      value: value,
      tooltipContainer: tooltipContainer
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function Templating(props) {
  const {
    debounce,
    id,
    label,
    onInput,
    onError,
    value = '',
    disabled = false,
    tooltipContainer
  } = props;
  const [localValue, setLocalValue] = useState(value);
  const editorRef = useShowEntryEvent(id);
  const containerRef = useRef();
  const [focus, _setFocus] = useState(undefined);
  const setFocus = (offset = 0) => {
    const hasFocus = containerRef.current.contains(document.activeElement);

    // Keep caret position if it is already focused, otherwise focus at the end
    const position = hasFocus ? document.activeElement.selectionStart : Infinity;
    _setFocus(position + offset);
  };
  const handleInputCallback = useMemo(() => {
    return debounce(newValue => onInput(newValue.length ? newValue : undefined));
  }, [onInput, debounce]);
  const handleInput = newValue => {
    handleInputCallback(newValue);
    setLocalValue(newValue);
  };
  const handleLint = useStaticCallback(lint => {
    const errors = lint && lint.length && lint.filter(e => e.severity === 'error') || [];
    if (!errors.length) {
      onError(undefined);
      return;
    }
    const error = errors[0];
    const message = `${error.source}: ${error.message}`;
    onError(message);
  });
  useEffect(() => {
    if (typeof focus !== 'undefined') {
      editorRef.current.focus(focus);
      _setFocus(undefined);
    }
  }, [focus]);
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value ? value : '');
  }, [value]);
  return jsxs("div", {
    class: "bio-properties-panel-feelers",
    children: [jsx("label", {
      id: prefixIdLabel(id),
      class: "bio-properties-panel-label",
      onClick: () => setFocus(),
      children: label
    }), jsx("div", {
      class: "bio-properties-panel-feelers-input",
      ref: containerRef,
      children: jsx(TemplatingEditor, {
        name: id,
        onInput: handleInput,
        contentAttributes: {
          'id': prefixId$5(id),
          'aria-labelledby': prefixIdLabel(id)
        },
        disabled: disabled,
        onLint: handleLint,
        value: localValue,
        ref: editorRef,
        tooltipContainer: tooltipContainer
      })
    })]
  });
}
function isEdited$4(node) {
  return node && (!!node.value || node.classList.contains('edited'));
}

// helpers /////////////////

function prefixId$5(id) {
  return `bio-properties-panel-${id}`;
}
function prefixIdLabel(id) {
  return `bio-properties-panel-feelers-${id}-label`;
}

/**
 * Entry for handling lists represented as nested entries.
 *
 * @template Item
 * @param {object} props
 * @param {string} props.id
 * @param {*} props.element
 * @param {Function} props.onAdd
 * @param {import('preact').Component} props.component
 * @param {string|import('preact').ComponentChildren} [props.label='<empty>']
 * @param {Function} [props.onRemove]
 * @param {Item[]} [props.items]
 * @param {boolean} [props.open]
 * @param {string|boolean} [props.autoFocusEntry] either a custom selector string or true to focus the first input
 * @param {Function} [props.translate]
 * @returns
 */
function List(props) {
  const {
    id,
    element,
    items = [],
    component,
    label = '<empty>',
    open: shouldOpen,
    onAdd,
    onRemove,
    autoFocusEntry,
    translate = translateFallback,
    ...restProps
  } = props;
  const entryRef = useRef(null);
  const [open, setOpen] = useState(!!shouldOpen);
  const [sticky, setSticky] = useState(false);
  const hasItems = !!items.length;
  const toggleOpen = () => hasItems && setOpen(!open);
  const elementChanged = usePrevious(element) !== element;
  const newItems = useNewItems(items, elementChanged);
  useEffect(() => {
    if (open && !hasItems) {
      setOpen(false);
    }
  }, [open, hasItems]);

  /**
   * @param {MouseEvent} event
   */
  function addItem(event) {
    event.stopPropagation();
    onAdd();
    if (!open) {
      setOpen(true);
    }
  }

  // set css class when entry is sticky to top
  useStickyIntersectionObserver(entryRef, 'div.bio-properties-panel-scroll-container', setSticky);
  return jsxs("div", {
    "data-entry-id": id,
    class: classnames('bio-properties-panel-entry', 'bio-properties-panel-list-entry', hasItems ? '' : 'empty', open ? 'open' : ''),
    ref: entryRef,
    children: [jsxs("div", {
      class: classnames('bio-properties-panel-list-entry-header', sticky && open ? 'sticky' : ''),
      onClick: toggleOpen,
      children: [jsx("div", {
        class: classnames('bio-properties-panel-list-entry-header-title', open && 'open'),
        children: label
      }), jsxs("div", {
        class: "bio-properties-panel-list-entry-header-buttons",
        children: [jsxs("button", {
          type: "button",
          title: translate('Create new list item'),
          onClick: addItem,
          class: "bio-properties-panel-add-entry",
          children: [jsx(Create, {}), !hasItems ? jsx("span", {
            class: "bio-properties-panel-add-entry-label",
            children: translate('Create')
          }) : null]
        }), hasItems && jsx("div", {
          title: translate(`List contains {numOfItems} item${items.length != 1 ? 's' : ''}`, {
            numOfItems: items.length
          }),
          class: "bio-properties-panel-list-badge",
          children: items.length
        }), hasItems && jsx("button", {
          type: "button",
          title: translate('Toggle list item'),
          class: "bio-properties-panel-arrow",
          children: jsx(Arrow, {
            class: open ? 'bio-properties-panel-arrow-down' : 'bio-properties-panel-arrow-right'
          })
        })]
      })]
    }), hasItems && jsx(ItemsList, {
      ...restProps,
      autoFocusEntry: autoFocusEntry,
      component: component,
      element: element,
      id: id,
      items: items,
      newItems: newItems,
      onRemove: onRemove,
      open: open,
      translate: translate
    })]
  });
}
function ItemsList(props) {
  const {
    autoFocusEntry,
    component: Component,
    element,
    id,
    items,
    newItems,
    onRemove,
    open,
    translate,
    ...restProps
  } = props;
  const getKey = useKeyFactory();
  const newItem = newItems[0];
  useEffect(() => {
    if (newItem && autoFocusEntry) {
      // (0) select the parent entry (containing all list items)
      const entry = query(`[data-entry-id="${id}"]`);

      // (1) select the first input or a custom element to be focussed
      const selector = typeof autoFocusEntry === 'boolean' ? '.bio-properties-panel-input' : autoFocusEntry;
      const focusableInput = query(selector, entry);

      // (2) set focus
      if (focusableInput) {
        if (isFunction(focusableInput.select)) {
          focusableInput.select();
        } else if (isFunction(focusableInput.focus)) {
          focusableInput.focus();
        }
      }
    }
  }, [newItem, autoFocusEntry, id]);
  return jsx("ol", {
    class: classnames('bio-properties-panel-list-entry-items', open ? 'open' : ''),
    children: items.map((item, index) => {
      const key = getKey(item);
      return jsxs("li", {
        class: "bio-properties-panel-list-entry-item",
        children: [jsx(Component, {
          ...restProps,
          element: element,
          id: id,
          index: index,
          item: item,
          open: item === newItem
        }), onRemove && jsx("button", {
          type: "button",
          title: translate('Delete item'),
          class: "bio-properties-panel-remove-entry bio-properties-panel-remove-list-entry",
          onClick: () => onRemove && onRemove(item),
          children: jsx(Delete, {})
        })]
      }, key);
    })
  });
}
function useNewItems(items = [], shouldReset) {
  const previousItems = usePrevious(items.slice()) || [];
  if (shouldReset) {
    return [];
  }
  return previousItems ? items.filter(item => !previousItems.includes(item)) : [];
}

/**
 * @typedef { { value: string, label: string, disabled: boolean, children: { value: string, label: string, disabled: boolean } } } Option
 */

/**
 * Provides basic select input.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string[]} props.path
 * @param {string} props.label
 * @param {Function} props.onChange
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {Array<Option>} [props.options]
 * @param {string} props.value
 * @param {boolean} [props.disabled]
 */
function Select(props) {
  const {
    id,
    label,
    onChange,
    options = [],
    value = '',
    disabled,
    onFocus,
    onBlur,
    tooltip
  } = props;
  const ref = useShowEntryEvent(id);
  const [localValue, setLocalValue] = useState(value);
  const handleChangeCallback = ({
    target
  }) => {
    onChange(target.value);
  };
  const handleChange = e => {
    handleChangeCallback(e);
    setLocalValue(e.target.value);
  };
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  return jsxs("div", {
    class: "bio-properties-panel-select",
    children: [jsx("label", {
      for: prefixId$4(id),
      class: "bio-properties-panel-label",
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: props.element,
        children: label
      })
    }), jsx("select", {
      ref: ref,
      id: prefixId$4(id),
      name: id,
      class: "bio-properties-panel-input",
      onInput: handleChange,
      onFocus: onFocus,
      onBlur: onBlur,
      value: localValue,
      disabled: disabled,
      children: options.map((option, idx) => {
        if (option.children) {
          return jsx("optgroup", {
            label: option.label,
            children: option.children.map((child, idx) => jsx("option", {
              value: child.value,
              disabled: child.disabled,
              children: child.label
            }, idx))
          }, idx);
        }
        return jsx("option", {
          value: option.value,
          disabled: option.disabled,
          children: option.label
        }, idx);
      })
    })]
  });
}

/**
 * @param {object} props
 * @param {object} props.element
 * @param {string} props.id
 * @param {string} [props.description]
 * @param {string} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {Function} props.getOptions
 * @param {boolean} [props.disabled]
 * @param {import('../util/diagnostics').ValidateFunction} [props.validate]
 * @param {string|import('preact').Component} props.tooltip
 */
function SelectEntry(props) {
  const {
    element,
    id,
    description,
    label,
    getValue,
    setValue,
    getOptions,
    disabled,
    onFocus,
    onBlur,
    validate,
    tooltip
  } = props;
  const options = getOptions(element);
  const diagnostics = useDiagnostics(id);
  const [localDiagnostic, setLocalDiagnostic] = useState(null);
  let value = getValue(element);
  useEffect(() => {
    if (isFunction(validate)) {
      const newValidationError = validate(value) || null;
      setLocalDiagnostic(newValidationError);
    }
  }, [value, validate]);
  const onChange = newValue => {
    if (newValue !== value) {
      let newValidationError = null;
      if (isFunction(validate)) {
        newValidationError = validate(newValue) || null;
      }
      setValue(newValue, newValidationError);
      setLocalDiagnostic(newValidationError);
    }
  };

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, localDiagnostic]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(Select, {
      id: id,
      label: label,
      value: value,
      onChange: onChange,
      onFocus: onFocus,
      onBlur: onBlur,
      options: options,
      disabled: disabled,
      tooltip: tooltip,
      element: element
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function isEdited$3(node) {
  return node && !!node.value;
}

// helpers /////////////////

function prefixId$4(id) {
  return `bio-properties-panel-${id}`;
}

/**
 * @param {Object} props
 * @param {Function} props.debounce
 * @param {Boolean} [props.disabled]
 * @param {Object} props.element
 * @param {Function} props.getValue
 * @param {String} props.id
 * @param {Function} [props.onBlur]
 * @param {Function} [props.onFocus]
 * @param {Function} props.setValue
 * @param {Function} [props.translate]
 */
function Simple(props) {
  const {
    debounce,
    disabled,
    element,
    getValue,
    id,
    onBlur,
    onFocus,
    setValue,
    translate = translateFallback
  } = props;
  const value = getValue(element);
  const [localValue, setLocalValue] = useState(value);
  const handleInputCallback = useMemo(() => {
    return debounce(target => setValue(target.value.length ? target.value : undefined));
  }, [setValue, debounce]);
  const handleInput = e => {
    handleInputCallback(e.target);
    setLocalValue(e.target.value);
  };
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  return jsx("div", {
    class: "bio-properties-panel-simple",
    children: jsx("input", {
      id: prefixId$3(id),
      type: "text",
      name: id,
      spellCheck: "false",
      autoComplete: "off",
      disabled: disabled,
      class: "bio-properties-panel-input",
      onInput: handleInput,
      "aria-label": localValue || translate('<empty>'),
      onFocus: onFocus,
      onBlur: onBlur,
      value: localValue
    }, element)
  });
}
function isEdited$2(node) {
  return node && !!node.value;
}

// helpers /////////////////

function prefixId$3(id) {
  return `bio-properties-panel-${id}`;
}

function TextArea(props) {
  const {
    id,
    element,
    label,
    debounce,
    onInput: commitValue,
    value = '',
    disabled,
    monospace,
    onFocus,
    onBlur,
    onPaste,
    autoResize = true,
    placeholder,
    rows = autoResize ? 1 : 2,
    tooltip,
    translate = translateFallback
  } = props;
  const [localValue, setLocalValue] = useState(value);
  const ref = useShowEntryEvent(id);
  const containerRef = useRef();

  // keep a live reference to the current value so callbacks captured by the
  // popup (frozen at open time) can compare against the latest value
  const localValueRef = useRef(localValue);
  localValueRef.current = localValue;
  const {
    eventBus
  } = useContext(EventContext);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const onInput = useCallback(newValue => {
    const newModelValue = newValue === '' ? undefined : newValue;
    commitValue(newModelValue);
  }, [commitValue]);

  /**
   * @type { import('min-dash').DebouncedFunction }
   */
  const handleInput = useDebounce(onInput, debounce);
  const handleLocalInput = e => {
    if (e.target.value === localValue) {
      return;
    }
    setLocalValue(e.target.value);
    handleInput(e.target.value);
  };
  const handleOnBlur = e => {
    const trimmedValue = e.target.value.trim();

    // trim and commit on blur
    handleInput.cancel?.();
    onInput(trimmedValue);
    setLocalValue(trimmedValue);
    if (onBlur) {
      onBlur(e);
    }
  };
  const handleOnPaste = e => {
    const input = e.target;
    const isFieldEmpty = !input.value;
    const isAllSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;

    // Trim and handle paste if field is empty or all content is selected
    if (isFieldEmpty || isAllSelected) {
      const trimmedValue = e.clipboardData.getData('text').trim();
      setLocalValue(trimmedValue);
      handleInput(trimmedValue);
      if (onPaste) {
        onPaste(e);
      }
      e.preventDefault();
      return;
    }

    // Allow default paste behavior for normal text editing
    if (onPaste) {
      onPaste(e);
    }
  };
  const handleOnKeyDown = e => {
    if (isCmdWithChar(e)) {
      handleInput.flush?.();
    }
  };
  const handlePopupInput = newValue => {
    if (newValue === localValueRef.current) {
      return;
    }
    setLocalValue(newValue);
    handleInput(newValue);
  };
  const handleOpenPopup = () => {
    const isOpen = eventBus.fire('propertiesPanel.openPopup', {
      element,
      entryId: id,
      label,
      onInput: handlePopupInput,
      sourceElement: ref.current,
      value: localValue
    });
    if (isOpen) {
      eventBus.once('propertiesPanelPopup.close', () => {
        handleInput.flush?.();
        setIsPopupOpen(false);
      });
    }
    setIsPopupOpen(isOpen === true);
  };
  useEffect(() => {
    return () => {
      eventBus && eventBus.fire('propertiesPanel.closePopup');
    };
  }, []);
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  return jsxs("div", {
    class: "bio-properties-panel-textarea",
    children: [jsx("label", {
      for: prefixId$2(id),
      class: "bio-properties-panel-label",
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: element,
        children: label
      })
    }), jsxs("div", {
      class: classnames('bio-properties-panel-textarea-container', isPopupOpen ? 'popupOpen' : null),
      ref: containerRef,
      children: [isPopupOpen && jsx("div", {
        class: "bio-properties-panel-textarea__open-popup-placeholder",
        children: translate('Opened in editor')
      }), jsx("textarea", {
        ref: ref,
        id: prefixId$2(id),
        name: id,
        spellCheck: "false",
        class: classnames('bio-properties-panel-input', monospace ? 'bio-properties-panel-input-monospace' : '', autoResize ? 'auto-resize' : ''),
        onInput: handleLocalInput,
        onFocus: onFocus,
        onKeyDown: handleOnKeyDown,
        onBlur: handleOnBlur,
        onPaste: handleOnPaste,
        placeholder: placeholder,
        rows: rows,
        value: localValue,
        disabled: disabled,
        "data-gramm": "false"
      }), eventBus && !disabled && jsx(OpenPopupButton, {
        onClick: handleOpenPopup,
        translate: translate
      })]
    })]
  });
}

/**
 * @param {object} props
 * @param {object} props.element
 * @param {string} props.id
 * @param {string} props.description
 * @param {boolean} props.debounce
 * @param {string} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {Function} props.onPaste
 * @param {number} props.rows
 * @param {boolean} props.monospace
 * @param {import('../util/diagnostics').ValidateFunction} [props.validate]
 * @param {boolean} [props.disabled]
 * @param {Function} [props.translate]
 */
function TextAreaEntry(props) {
  const {
    element,
    id,
    description,
    debounce,
    label,
    getValue,
    setValue,
    rows,
    monospace,
    disabled,
    validate,
    onFocus,
    onBlur,
    onPaste,
    placeholder,
    autoResize,
    tooltip,
    translate
  } = props;
  const diagnostics = useDiagnostics(id);
  const [localDiagnostic, setLocalDiagnostic] = useState(null);
  let value = getValue(element);
  useEffect(() => {
    if (isFunction(validate)) {
      const newValidationError = validate(value) || null;
      setLocalDiagnostic(newValidationError);
    }
  }, [value, validate]);
  const onInput = useStaticCallback(newValue => {
    const value = getValue(element);
    if (newValue !== value) {
      let newValidationError = null;
      if (isFunction(validate)) {
        newValidationError = validate(newValue) || null;
      }
      setValue(newValue, newValidationError);
      setLocalDiagnostic(newValidationError);
    }
  });

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, localDiagnostic]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(TextArea, {
      id: id,
      label: label,
      value: value,
      onInput: onInput,
      onFocus: onFocus,
      onBlur: onBlur,
      onPaste: onPaste,
      rows: rows,
      debounce: debounce,
      monospace: monospace,
      disabled: disabled,
      placeholder: placeholder,
      autoResize: autoResize,
      tooltip: tooltip,
      translate: translate,
      element: element
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function isEdited$1(node) {
  return node && !!node.value;
}

// helpers /////////////////

function prefixId$2(id) {
  return `bio-properties-panel-${id}`;
}

function Textfield(props) {
  const {
    debounce,
    disabled = false,
    id,
    label,
    onInput: commitValue,
    onFocus,
    onBlur,
    onPaste,
    placeholder,
    value = '',
    tooltip
  } = props;
  const [localValue, setLocalValue] = useState(value || '');
  const ref = useShowEntryEvent(id);
  const onInput = useCallback(newValue => {
    const newModelValue = newValue === '' ? undefined : newValue;
    commitValue(newModelValue);
  }, [commitValue]);

  /**
   * @type { import('min-dash').DebouncedFunction }
   */
  const handleInput = useDebounce(onInput, debounce);
  const handleOnBlur = e => {
    const trimmedValue = e.target.value.trim();

    // trim and commit on blur
    handleInput.cancel?.();
    onInput(trimmedValue);
    setLocalValue(trimmedValue);
    if (onBlur) {
      onBlur(e);
    }
  };
  const handleOnPaste = e => {
    const input = e.target;
    const isFieldEmpty = !input.value;
    const isAllSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;

    // Trim and handle paste if field is empty or all content is selected (overwrite)
    if (isFieldEmpty || isAllSelected) {
      const trimmedValue = e.clipboardData.getData('text').trim();
      setLocalValue(trimmedValue);
      handleInput(trimmedValue);
      if (onPaste) {
        onPaste(e);
      }
      e.preventDefault();
      return;
    }

    // Allow default paste behavior for normal text editing
    if (onPaste) {
      onPaste(e);
    }
  };
  const handleLocalInput = e => {
    if (e.target.value === localValue) {
      return;
    }
    setLocalValue(e.target.value);
    handleInput(e.target.value);
  };
  useEffect(() => {
    if (value === localValue) {
      return;
    }
    setLocalValue(value);
  }, [value]);
  const handleOnKeyDown = e => {
    if (isCmdWithChar(e)) {
      handleInput.flush?.();
    }
  };
  return jsxs("div", {
    class: "bio-properties-panel-textfield",
    children: [jsx("label", {
      for: prefixId$1(id),
      class: "bio-properties-panel-label",
      children: jsx(TooltipWrapper, {
        value: tooltip,
        forId: id,
        element: props.element,
        children: label
      })
    }), jsx("input", {
      ref: ref,
      id: prefixId$1(id),
      type: "text",
      name: id,
      spellCheck: "false",
      autoComplete: "off",
      disabled: disabled,
      class: "bio-properties-panel-input",
      onInput: handleLocalInput,
      onFocus: onFocus,
      onKeyDown: handleOnKeyDown,
      onBlur: handleOnBlur,
      onPaste: handleOnPaste,
      placeholder: placeholder,
      value: localValue
    })]
  });
}

/**
 * @param {Object} props
 * @param {Object} props.element
 * @param {String} props.id
 * @param {String} props.description
 * @param {Boolean} props.debounce
 * @param {Boolean} props.disabled
 * @param {String} props.label
 * @param {Function} props.getValue
 * @param {Function} props.setValue
 * @param {Function} props.onFocus
 * @param {Function} props.onBlur
 * @param {string|import('preact').Component} props.tooltip
 * @param {import('../util/diagnostics').ValidateFunction} props.validate
 */
function TextfieldEntry(props) {
  const {
    element,
    id,
    description,
    debounce,
    disabled,
    label,
    getValue,
    setValue,
    validate,
    onFocus,
    onBlur,
    onPaste,
    placeholder,
    tooltip
  } = props;
  const diagnostics = useDiagnostics(id);
  const [localDiagnostic, setLocalDiagnostic] = useState(null);
  let value = getValue(element);
  useEffect(() => {
    if (isFunction(validate)) {
      const newValidationError = validate(value) || null;
      setLocalDiagnostic(newValidationError);
    }
  }, [value, validate]);
  const onInput = useStaticCallback(newValue => {
    const value = getValue(element);
    if (newValue !== value) {
      let newValidationError = null;
      if (isFunction(validate)) {
        newValidationError = validate(newValue) || null;
      }
      setValue(newValue, newValidationError);
      setLocalDiagnostic(newValidationError);
    }
  });

  // most severe wins, externally provided diagnostics win ties
  const diagnostic = getMostSevere([...diagnostics, localDiagnostic]);
  return jsxs("div", {
    class: classnames('bio-properties-panel-entry', getDiagnosticClass(diagnostic)),
    "data-entry-id": id,
    children: [jsx(Textfield, {
      debounce: debounce,
      disabled: disabled,
      id: id,
      label: label,
      onInput: onInput,
      onFocus: onFocus,
      onBlur: onBlur,
      onPaste: onPaste,
      placeholder: placeholder,
      value: value,
      tooltip: tooltip,
      element: element
    }, element), jsx(DiagnosticMessage, {
      diagnostic: diagnostic,
      forId: id,
      element: element
    }), jsx(Description, {
      forId: id,
      element: element,
      value: description
    })]
  });
}
function isEdited(node) {
  return node && !!node.value;
}

// helpers /////////////////

function prefixId$1(id) {
  return `bio-properties-panel-${id}`;
}

const DEFAULT_DEBOUNCE_TIME = 600;

/**
 * Creates a debounced version of a function, delaying its execution based on `debounceDelay`.
 *
 * - If `debounceDelay` is `false`, the function executes immediately without debouncing.
 * - If a number is provided, the function execution is delayed by the given time in milliseconds.
 *
 * @param { Boolean | Number } [debounceDelay=600]
 *
 * @example
 * const debounce = debounceInput();
 * const debouncedFn = debounce(fn);
 *
 * debouncedFn(); // Executes after 300ms (default) if no further calls occur.
 */
function debounceInput(debounceDelay) {
  /**
   * Applies debounce to the provided function, with a previously setup delay.
   *
   * @template { (...args: any[]) => any } T
   *
   * @param {T} fn
   *
   * @return { (...p: Parameters<T>) => any }
   */
  return function debounce$1(fn) {
    if (debounceDelay === false) {
      return fn;
    }
    var debounceTime = isNumber(debounceDelay) ? debounceDelay : DEFAULT_DEBOUNCE_TIME;
    return debounce(fn, debounceTime);
  };
}
debounceInput.$inject = ['config.debounceInput'];

var index$1 = {
  debounceInput: ['factory', debounceInput]
};

function getPopupTitle({
  element,
  label
}) {
  let popupTitle = '';
  if (element && element.type) {
    popupTitle = `${element.type} / `;
  }
  return `${popupTitle}${label}`;
}

/**
 * Add a dragger that calls back the passed function with
 * { event, delta } on drag.
 *
 * @example
 *
 * function dragMove(event, delta) {
 *   // we are dragging (!!)
 * }
 *
 * domElement.addEventListener('dragstart', dragger(dragMove));
 *
 * @param {Function} fn
 * @param {Element} [dragPreview]
 *
 * @return {Function} drag start callback function
 */
function createDragger(fn, dragPreview) {
  let self;
  let startX, startY;

  /** drag start */
  function onDragStart(event) {
    self = this;
    startX = event.clientX;
    startY = event.clientY;

    // (1) prevent preview image
    if (event.dataTransfer) {
      event.dataTransfer.setDragImage(dragPreview || emptyCanvas(), 0, 0);
    }

    // (2) setup drag listeners

    // attach drag + cleanup event
    // we need to do this to make sure we track cursor
    // movements before we reach other drag event handlers,
    // e.g. in child containers.
    document.addEventListener('dragover', onDrag, true);
    document.addEventListener('dragenter', preventDefault, true);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('drop', preventDefault);
  }
  function onDrag(event) {
    const delta = {
      x: event.clientX - startX,
      y: event.clientY - startY
    };

    // call provided fn with event, delta
    return fn.call(self, event, delta);
  }
  function onEnd() {
    document.removeEventListener('dragover', onDrag, true);
    document.removeEventListener('dragenter', preventDefault, true);
    document.removeEventListener('dragend', onEnd);
    document.removeEventListener('drop', preventDefault);
  }
  return onDragStart;
}
function preventDefault(event) {
  event.preventDefault();
  event.stopPropagation();
}
function emptyCanvas() {
  return domify('<canvas width="0" height="0" />');
}

const noop = () => {};

/**
 * A generic popup component.
 *
 * @param {Object} props
 * @param {string} [props.className]
 * @param {boolean} [props.delayInitialFocus]
 * @param {{top: number, left: number}} [props.position]
 * @param {number} [props.width]
 * @param {number} [props.height]
 * @param {Function} props.onClose
 * @param {Function} [props.onPostActivate]
 * @param {Function} [props.onPostDeactivate]
 * @param {boolean} [props.returnFocus]
 * @param {boolean} [props.closeOnEscape]
 * @param {(event: KeyboardEvent) => boolean} [props.allowFocusMove] -
 *   Whether a Tab keypress may move focus. Return false to leave the keypress
 *   to the focused element, e.g. an editor navigating snippet placeholders.
 * @param {string} props.title
 * @param {Ref} [ref]
 */
function PopupComponent(props, globalRef) {
  const {
    className,
    delayInitialFocus,
    position,
    width,
    height,
    onClose,
    onPostActivate = noop,
    onPostDeactivate = noop,
    returnFocus = true,
    closeOnEscape = true,
    allowFocusMove = () => true,
    title
  } = props;
  const focusTrapRef = useRef(null);
  const localRef = useRef(null);
  const popupRef = globalRef || localRef;
  const handleKeydown = event => {
    // do not allow keyboard events to bubble
    event.stopPropagation();
    if (closeOnEscape && event.key === 'Escape') {
      onClose();
    }
  };

  // re-activate focus trap on focus
  const handleFocus = () => {
    if (focusTrapRef.current) {
      focusTrapRef.current.activate();
    }
  };
  const {
    top,
    left
  } = position || getCenterPosition(width, height);
  const style = {};
  if (isDefined(top) && isDefined(left)) {
    style.top = top + 'px';
    style.left = left + 'px';
  }
  if (width) {
    style.width = width + 'px';
  }
  if (height) {
    style.height = height + 'px';
  }
  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.addEventListener('focusin', handleFocus);
    }
    return () => {
      if (popupRef.current) {
        popupRef.current.removeEventListener('focusin', handleFocus);
      }
    };
  }, [popupRef]);
  useEffect(() => {
    if (popupRef.current) {
      focusTrapRef.current = focusTrap.createFocusTrap(popupRef.current, {
        clickOutsideDeactivates: true,
        delayInitialFocus,
        fallbackFocus: popupRef.current,
        isKeyForward: event => isTab(event) && !event.shiftKey && allowFocusMove(event),
        isKeyBackward: event => isTab(event) && event.shiftKey && allowFocusMove(event),
        onPostActivate,
        onPostDeactivate,
        returnFocusOnDeactivate: returnFocus
      });
      focusTrapRef.current.activate();
    }
    return () => focusTrapRef.current && focusTrapRef.current.deactivate();
  }, [popupRef]);
  return jsx("div", {
    "aria-label": title,
    tabIndex: -1,
    ref: popupRef,
    onKeyDown: handleKeydown,
    role: "dialog",
    class: classnames('bio-properties-panel-popup', 'bio-theme-parent', className),
    style: style,
    children: props.children
  });
}
const Popup$1 = forwardRef(PopupComponent);
Popup$1.Title = Title;
Popup$1.Body = Body;
Popup$1.Footer = Footer;
function Title(props) {
  const {
    eventBus
  } = useContext(EventContext);
  const {
    children,
    className,
    draggable,
    title,
    showCloseButton = false,
    closeButtonTooltip = 'Close popup',
    onClose,
    ...rest
  } = props;

  // we can't use state as we need to
  // manipulate this inside dragging events
  const context = useRef({
    startPosition: null,
    newPosition: null
  });
  const dragPreviewRef = useRef();
  const titleRef = useRef();
  const onMove = (event, delta) => {
    cancel(event);
    const {
      x: dx,
      y: dy
    } = delta;
    const newPosition = {
      x: context.current.startPosition.x + dx,
      y: context.current.startPosition.y + dy
    };
    const popupParent = getPopupParent(titleRef.current);
    popupParent.style.top = newPosition.y + 'px';
    popupParent.style.left = newPosition.x + 'px';
    eventBus?.fire('feelPopup.dragover', {
      newPosition,
      delta
    });
  };
  const onMoveStart = event => {
    // initialize drag handler
    const onDragStart = createDragger(onMove, dragPreviewRef.current);
    onDragStart(event);
    event.stopPropagation();
    const popupParent = getPopupParent(titleRef.current);
    const bounds = popupParent.getBoundingClientRect();
    context.current.startPosition = {
      x: bounds.left,
      y: bounds.top
    };
    eventBus?.fire('feelPopup.dragstart');
  };
  const onMoveEnd = () => {
    context.current.newPosition = null;
    eventBus?.fire('feelPopup.dragend');
  };
  return jsxs("div", {
    class: classnames('bio-properties-panel-popup__header', draggable && 'draggable', className),
    ref: titleRef,
    draggable: draggable,
    onDragStart: onMoveStart,
    onDragEnd: onMoveEnd,
    ...rest,
    children: [draggable && jsxs(Fragment, {
      children: [jsx("div", {
        ref: dragPreviewRef,
        class: "bio-properties-panel-popup__drag-preview"
      }), jsx("div", {
        class: "bio-properties-panel-popup__drag-handle",
        children: jsx(Drag, {})
      })]
    }), jsx("div", {
      class: "bio-properties-panel-popup__title",
      children: title
    }), children, showCloseButton && jsx("button", {
      type: "button",
      title: closeButtonTooltip,
      class: "bio-properties-panel-popup__close",
      onClick: onClose,
      children: jsx(Close, {})
    })]
  });
}
function Body(props) {
  const {
    children,
    className,
    ...rest
  } = props;
  return jsx("div", {
    class: classnames('bio-properties-panel-popup__body', className),
    ...rest,
    children: children
  });
}
function Footer(props) {
  const {
    children,
    className,
    ...rest
  } = props;
  return jsx("div", {
    class: classnames('bio-properties-panel-popup__footer', className),
    ...rest,
    children: props.children
  });
}

// helpers //////////////////////

/**
 * Center the popup in the viewport, based on its own dimensions.
 *
 * @param {number} [width]
 * @param {number} [height]
 */
function getCenterPosition(width, height) {
  if (!width || !height) {
    return {};
  }
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return {
    left: Math.max(0, (viewportWidth - width) / 2),
    top: Math.max(0, (viewportHeight - height) / 2)
  };
}
function isTab(event) {
  return event.key === 'Tab';
}
function getPopupParent(node) {
  return node.closest('.bio-properties-panel-popup');
}
function cancel(event) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * @typedef {Object} FeelPopupProps
 * @property {string} entryId
 * @property {Function} onInput
 * @property {Function} onClose
 * @property {string} title
 * @property {'feel'|'feelers'} type
 * @property {string} value
 * @property {Array} [links]
 * @property {Array|Object} [variables]
 * @property {string} [hostLanguage]
 * @property {boolean} [singleLine]
 * @property {HTMLElement} [sourceElement]
 * @property {HTMLElement|string} [tooltipContainer]
 */

const FEEL_POPUP_WIDTH = 700;
const FEEL_POPUP_HEIGHT = 400;

/**
 * FEEL expression editor popup component
 * @param {FeelPopupProps} props
 */
function FeelPopup(props) {
  const {
    entryId,
    onInput,
    onClose,
    title,
    type,
    value,
    links,
    variables,
    hostLanguage,
    singleLine,
    sourceElement,
    tooltipContainer,
    feelLanguageContext
  } = props;
  const editorRef = useRef();
  const popupRef = useRef();
  const isAutoCompletionOpen = useRef(false);
  const handleSetReturnFocus = () => {
    sourceElement && sourceElement.focus();
  };
  const onKeyDownCapture = event => {
    // we use capture here to make sure we handle the event before the editor does
    if (event.key === 'Escape') {
      isAutoCompletionOpen.current = autoCompletionOpen(event.target);
    }
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') {
      // close popup only if auto completion is not open
      if (!isAutoCompletionOpen.current) {
        onClose();
        isAutoCompletionOpen.current = false;
      }
    }
  };
  useEffect(() => {
    // set focus on editor when popup is opened
    if (editorRef.current) {
      editorRef.current.focus();
    }
  }, [editorRef]);
  return jsxs(Popup$1, {
    className: "bio-properties-panel-feel-popup",
    title: title,
    returnFocus: false,
    closeOnEscape: false,
    delayInitialFocus: false,
    allowFocusMove: event => !isSnippetNavigation(event),
    onPostDeactivate: handleSetReturnFocus,
    height: FEEL_POPUP_HEIGHT,
    width: FEEL_POPUP_WIDTH,
    ref: popupRef,
    children: [jsx(Popup$1.Title, {
      title: title,
      showCloseButton: true,
      closeButtonTooltip: "Save and close",
      onClose: onClose,
      draggable: true,
      children: jsx(Fragment, {
        children: (links || []).map((link, index) => {
          return jsxs("a", {
            rel: "noreferrer",
            href: link.href,
            target: "_blank",
            class: "bio-properties-panel-feel-popup__title-link",
            children: [link.title, jsx(Launch, {})]
          }, index);
        })
      })
    }), jsx(Popup$1.Body, {
      children: jsxs("div", {
        onKeyDownCapture: onKeyDownCapture,
        onKeyDown: onKeyDown,
        class: "bio-properties-panel-feel-popup__body",
        children: [type === 'feel' && jsx(FeelEditor, {
          enableGutters: true,
          name: entryId,
          onInput: onInput,
          value: value,
          variables: variables,
          feelLanguageContext: feelLanguageContext,
          ref: editorRef,
          tooltipContainer: tooltipContainer
        }), type === 'feelers' && jsx(TemplatingEditor, {
          contentAttributes: {
            'aria-label': title
          },
          enableGutters: true,
          hostLanguage: hostLanguage,
          name: entryId,
          onInput: onInput,
          value: value,
          ref: editorRef,
          singleLine: singleLine,
          tooltipContainer: tooltipContainer
        })]
      })
    })]
  });
}
function autoCompletionOpen(element) {
  const editor = element.closest('.cm-editor');
  return editor ? editor.querySelector('.cm-tooltip-autocomplete') : null;
}

// while a snippet is active, Tab navigates its placeholders inside the editor
function isSnippetNavigation(event) {
  const editor = event.target.closest('.cm-editor');
  return !!(editor && editor.querySelector('.cm-snippetField'));
}

/**
 * @typedef {Object} TextPopupProps
 * @property {string} entryId
 * @property {Function} onInput
 * @property {Function} onClose
 * @property {string} title
 * @property {string} value
 * @property {HTMLElement} [sourceElement]
 */

const TEXT_POPUP_WIDTH = 700;
const TEXT_POPUP_HEIGHT = 400;

/**
 * Plain text editor popup component.
 *
 * Intentionally kept separate from the FEEL popup: the two are expected to
 * diverge as we add FEEL-specific capabilities that do not apply to plain text.
 *
 * @param {TextPopupProps} props
 */
function TextPopup(props) {
  const {
    entryId,
    onInput,
    onClose,
    title,
    value,
    sourceElement
  } = props;
  const editorRef = useRef();
  const popupRef = useRef();
  const handleSetReturnFocus = () => {
    sourceElement && sourceElement.focus();
  };
  useEffect(() => {
    // set focus on editor when popup is opened
    if (editorRef.current) {
      editorRef.current.focus();
    }
  }, [editorRef]);
  return jsxs(Popup$1, {
    className: "bio-properties-panel-text-popup",
    title: title,
    returnFocus: false,
    closeOnEscape: true,
    delayInitialFocus: false,
    onClose: onClose,
    onPostDeactivate: handleSetReturnFocus,
    height: TEXT_POPUP_HEIGHT,
    width: TEXT_POPUP_WIDTH,
    ref: popupRef,
    children: [jsx(Popup$1.Title, {
      title: title,
      showCloseButton: true,
      closeButtonTooltip: "Save and close",
      onClose: onClose,
      draggable: true
    }), jsx(Popup$1.Body, {
      children: jsx("textarea", {
        id: prefixId(entryId),
        name: entryId,
        class: "bio-properties-panel-input",
        ref: editorRef,
        onInput: e => onInput(e.target.value),
        value: value || '',
        spellCheck: "false",
        autoComplete: "off",
        "aria-label": title,
        "data-gramm": "false"
      })
    })]
  });
}

// The in-panel field stays mounted (hidden) while the popup is open, so we
// scope the popup editor id to keep it unique in the DOM.
function prefixId(id) {
  return `bio-properties-panel-popup-${id}`;
}

const DEFAULT_POPUP_TYPE = 'text';

// consumers registering via #registerProvider default to DEFAULT_PRIORITY,
// so their providers take precedence over the LOW_PRIORITY built-ins.
const DEFAULT_PRIORITY = 1000;
const LOW_PRIORITY = 500;

/**
 * Popup manager, built as a singleton. Renders the registered provider for a
 * given popup type; consumers may plug in their own via #registerProvider.
 *
 * In order to implement a custom replacement, handle the following events:
 * - `propertiesPanel.openPopup`
 * - `propertiesPanel.closePopup`
 * - `propertiesPanel.detach`
 *
 * Within the custom renderer, make sure to emit the following events:
 *  - `feelPopup.open` - fired before the popup is mounted
 *  - `feelPopup.opened` - fired after the popup is mounted. Event context contains the DOM node of the popup as `domNode`
 *  - `feelPopup.close` - fired before the popup is unmounted. Event context contains the DOM node of the popup as `domNode`
 *  - `feelPopup.closed` - fired after the popup is unmounted
 */
class Popup {
  constructor(eventBus, config = {}) {
    this._eventBus = eventBus;
    this._config = config;
    this._isOpen = false;

    // built-in providers, registered at LOW_PRIORITY so consumers can
    // override them via #registerProvider using the default priority
    this.registerProvider('feel', LOW_PRIORITY, FeelPopup);
    this.registerProvider('feelers', LOW_PRIORITY, FeelPopup);
    this.registerProvider('text', LOW_PRIORITY, TextPopup);
    eventBus.on('propertiesPanel.openPopup', (_, context) => {
      return this.open(context.entryId, context, context.sourceElement);
    });
    eventBus.on(['propertiesPanel.closePopup', 'propertiesPanel.detach'], () => {
      this.close();
    });
  }

  /**
   * Register a popup provider (component) for a given type.
   *
   * A higher `priority` wins when multiple providers are registered for the
   * same type; the built-in providers use a low priority so consumers override
   * them by default.
   *
   * @param {string} type
   * @param {number} [priority=DEFAULT_PRIORITY]
   * @param {Function|import('preact').Component} provider
   */
  registerProvider(type, priority, provider) {
    if (!provider) {
      provider = priority;
      priority = DEFAULT_PRIORITY;
    }
    this._eventBus.on('propertiesPanelPopup.getProviders.' + type, priority, function (event) {
      event.providers.push(provider);
    });
  }

  /**
   * Get the popup providers registered for a type.
   *
   * @param {string} type
   * @return {Array<Function|import('preact').Component>}
   */
  _getProviders(type) {
    const event = this._eventBus.createEvent({
      type: 'propertiesPanelPopup.getProviders.' + type,
      providers: []
    });
    this._eventBus.fire(event);
    return event.providers;
  }

  /**
   * Check if the popup is open.
   * @return {Boolean}
   */
  isOpen() {
    return this._isOpen;
  }

  /**
   * Open the popup.
   *
   * @param {String} entryId
   * @param {Object} popupConfig
   * @param {HTMLElement} sourceElement
   */
  open(entryId, popupConfig, sourceElement) {
    // close before opening a new one
    this.close();
    return this._openPopup({
      ...popupConfig,
      entryId,
      sourceElement
    });
  }

  /**
   * Close the popup.
   */
  close() {
    this._closePopup();
  }
  _openPopup(context) {
    const {
      element,
      label,
      sourceElement,
      type = DEFAULT_POPUP_TYPE
    } = context;
    const component = this._getProviders(type)[0];
    if (!component) {
      return false;
    }
    this._isOpen = true;
    this._eventBus.fire('propertiesPanelPopup.open', {
      container: this._config.feelPopupContainer,
      config: {
        ...context,
        component,
        links: this._config.getFeelPopupLinks?.(type) || [],
        onClose: () => {
          this._closePopup();

          // setTimeout to ensure the focus happens after the DOM updates make it focusable
          setTimeout(() => {
            sourceElement && sourceElement.focus();
          }, 0);
        },
        title: getPopupTitle({
          element,
          label
        })
      }
    });
    return true;
  }
  _closePopup() {
    if (this._isOpen) {
      this._isOpen = false;
      this._eventBus.fire('propertiesPanelPopup.close');
    }
  }
}
Popup.$inject = ['eventBus', 'config.propertiesPanel'];

class PopupRenderer {
  constructor(eventBus) {
    this._eventBus = eventBus;
    this._container = null;
    this._element = null;
    eventBus.on('propertiesPanelPopup.open', context => {
      this._renderPopup(context);
    });
    eventBus.on('propertiesPanelPopup.close', () => {
      this._removePopup();
    });
  }
  _renderPopup(context) {
    let {
      container,
      config
    } = context;
    container = this._container = getContainer(container) || document.body;
    const element = this._element = createElement();
    container.appendChild(element);
    this._emit('feelPopup.open');
    const Component = config.component;
    render(jsx(EventContext.Provider, {
      value: {
        eventBus: this._eventBus
      },
      children: jsx(Component, {
        ...config,
        eventBus: this._eventBus
      })
    }), element);
    this._emit('feelPopup.opened', {
      domNode: element
    });
  }
  _removePopup() {
    if (!this._container) {
      return;
    }
    this._emit('feelPopup.close', {
      domNode: this._element
    });
    render(null, this._element);
    this._container.removeChild(this._element);
    this._container = null;
    this._element = null;
    this._emit('feelPopup.closed');
  }
  _emit(event, context) {
    this._eventBus.fire(event, context);
  }
}
PopupRenderer.$inject = ['eventBus'];

// helpers /////////////////

function createElement() {
  const element = document.createElement('div');
  element.classList.add('bio-properties-panel-popup-container');
  return element;
}
function getContainer(container) {
  if (isString(container)) {
    return query(container);
  }
  return container;
}

var index = {
  __init__: ['feelPopup', 'feelPopupRenderer'],
  feelPopup: ['type', Popup],
  feelPopupRenderer: ['type', PopupRenderer]
};

export { Arrow as ArrowIcon, CheckboxEntry, CheckboxGroup, Close as CloseIcon, CollapsibleEntry, Create as CreateIcon, index$1 as DebounceInputModule, Delete as DeleteIcon, DescriptionContext, Description as DescriptionEntry, DiagnosticMessage, DiagnosticsContext, Drag as DragIcon, DropdownButton, ErrorsContext, EventContext, ExternalLink as ExternalLinkIcon, FeelCheckboxEntry, FeelEntry, Feel as FeelIcon, FeelLanguageContext, FeelNumberEntry, index as FeelPopupModule, FeelTemplatingEntry, FeelTextAreaEntry, FeelToggleSwitchEntry, Group, Header, HeaderButton, Info as InfoIcon, JsonEditorEntry, Launch as LaunchIcon, LayoutContext, List as ListEntry, ListGroup, ListItem, NumberFieldEntry, OpenPopup as OpenPopupIcon, Placeholder, Popup$1 as Popup, Body as PopupBody, Footer as PopupFooter, Title as PopupTitle, PropertiesPanel, LayoutContext as PropertiesPanelContext, SelectEntry, Simple as SimpleEntry, TemplatingEntry, TextAreaEntry, TextfieldEntry as TextFieldEntry, ToggleSwitchEntry, TooltipContext, TooltipWrapper as TooltipEntry, isEdited$9 as isCheckboxEntryEdited, isEdited$5 as isFeelEntryEdited, isEdited$8 as isJsonEditorEntryEdited, isEdited$6 as isNumberFieldEntryEdited, isEdited$3 as isSelectEntryEdited, isEdited$2 as isSimpleEntryEdited, isEdited$4 as isTemplatingEntryEdited, isEdited$1 as isTextAreaEntryEdited, isEdited as isTextFieldEntryEdited, isEdited$7 as isToggleSwitchEntryEdited, useAllDiagnostics, useDebounce, useDescriptionContext, useDiagnostics, useElementVisible, useError, useErrors, useEvent, useKeyFactory, useLayoutState, usePrevious, useShowEntryEvent, useStaticCallback, useStickyIntersectionObserver, useTooltipContext };

