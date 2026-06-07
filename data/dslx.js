"use strict";

class App {

    static textAreaLineHeight = 29;//px
    static textAreaPadding = 10;//px

    /** @type {boolean} */
    _willRefreshOnNextFrame = false;

    /** @type {HTMLCanvasElement} */
    _canvas;
    /** @type {HTMLTextAreaElement} */
    _textArea;

    /** @type {number} */
    _mouseClientX = NaN;
    /** @type {number} */
    _mouseClientY = NaN;

    constructor() {
        this.fitBodyOnWindow();

        this._canvas = document.body.querySelector(`canvas`);
        this._textArea = document.body.querySelector(`textarea`);

        this._textArea.style.lineHeight = `${App.textAreaLineHeight}px`;
        this._textArea.style.padding = `${App.textAreaPadding}px`;

        this._initTextAreaListeners();
        this.requestRefresh();
    }

    fitBodyOnWindow() {
        const bodyStyle = window.document.body.style;
        bodyStyle.margin = "0";

        const listener = event => {
            const target = event?.target;
            if (target && target !== window)
                return;
            bodyStyle.width = window.innerWidth + "px";
            bodyStyle.height = window.innerHeight + "px";
        };

        window.addEventListener("resize", listener, true);
        listener();
    }

    _initTextAreaListeners() {
        const textArea = this._textArea;

        textArea.addEventListener("mousemove", event => {
            this._mouseClientX = event.clientX ?? NaN;
            this._mouseClientY = event.clientY ?? NaN;
            this.requestRefresh();
        });
        textArea.addEventListener("mouseleave", () => {
            this._mouseClientX = NaN;
            this._mouseClientY = NaN;
            this.requestRefresh();
        });
        textArea.addEventListener("keydown", event => {
            const code = event.code;

            if (code === "ArrowUp") {
                this._mouseClientY -= App.textAreaLineHeight;
                this.requestRefresh();

            } else if (code === "ArrowDown") {
                this._mouseClientY += App.textAreaLineHeight;
                this.requestRefresh();
            }
        });

        const listener = () => this.requestRefresh();
        new ResizeObserver(listener).observe(textArea);
        textArea.addEventListener("input", listener);
        textArea.addEventListener("scroll", listener);
    }

    requestRefresh() {
        if (this._willRefreshOnNextFrame)
            return;
        this._willRefreshOnNextFrame = true;
        window.requestAnimationFrame(() => {
            this._willRefreshOnNextFrame = false;
            this._update();
        });
    }

    _update() {
        const canvas = this._canvas;
        const textArea = this._textArea;
        const textAreaBonds = textArea.getBoundingClientRect();

        canvas.style.top = `${textAreaBonds.top}px`;
        canvas.style.right = `${textAreaBonds.right}px`;
        canvas.style.bottom = `${textAreaBonds.bottom}px`;
        canvas.style.left = `${textAreaBonds.left}px`;
        canvas.width = textArea.clientWidth;
        canvas.height = textArea.clientHeight;

        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const textY = this._mouseClientY
            - textAreaBonds.top
            - textArea.clientTop
            - App.textAreaPadding
            + textArea.scrollTop;
        const lineIndex = Math.floor(textY / App.textAreaLineHeight);

        if (!(lineIndex >= 0))
            return;// NaN or negative

        ctx.fillStyle = "#FFFFFF22";
        ctx.fillRect(
            0,
            App.textAreaPadding + lineIndex * App.textAreaLineHeight - textArea.scrollTop,
            canvas.width,
            App.textAreaLineHeight
        );
    }

}

window.addEventListener("load", () => new App());