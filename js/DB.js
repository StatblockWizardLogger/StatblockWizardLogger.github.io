// @ts-check

"use strict";

class DB {
    constructor() {
    }

    setKeyValue(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value))
    }

    getKeyValue(key) {
        let v = window.localStorage.getItem(key);
        if (v) return (JSON.parse(v))
    }

    destroy(key) {
        window.localStorage.removeItem(key)
    }

    getItems() {
        const items = []
        var key;

        for (var i = 0; i < window.localStorage.length; i++) {
            key = window.localStorage.key(i);
            if (key) {
                items[i * 2] = key
                items[i * 2 + 1] = this.getKeyValue(key)
            }
        }
        return items
    }

    asObject() {
        const meAsObject = new Object
        const items = this.getItems()

        for (var i = 0; i < items.length; i += 2) {
            const valueobject = { value: items[i + 1], enumerable: true }
            Object.defineProperty(meAsObject, items[i], valueobject)
        }
        return meAsObject
    }
}