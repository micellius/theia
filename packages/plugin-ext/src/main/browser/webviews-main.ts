/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { WebviewsMain, WebviewPanelShowOptions, MAIN_RPC_CONTEXT, WebviewsExt } from '../../api/plugin-api';
import { interfaces } from 'inversify';
import { RPCProtocol } from '../../api/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { WebviewOptions, WebviewPanelOptions } from '@theia/plugin';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WebviewWidget } from './webview/webview';
import {ThemeService} from '@theia/core/lib/browser/theming';

export class WebviewsMainImpl implements WebviewsMain {

    private readonly proxy: WebviewsExt;
    protected readonly shell: ApplicationShell;
    protected readonly keybindings: KeybindingRegistry;
    protected readonly themeService: ThemeService;

    private readonly views = new Map<string, WebviewWidget>();
    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WEBVIEWS_EXT);
        this.shell = container.get(ApplicationShell);
        this.keybindings = container.get(KeybindingRegistry);
        this.themeService = container.get(ThemeService);
    }

    $createWebviewPanel(
        viewId: string,
        viewType: string,
        title: string,
        showOptions: WebviewPanelShowOptions,
        options: (WebviewPanelOptions & WebviewOptions) | undefined,
        extensionLocation: UriComponents
    ): void {
        const getThemeRules = (): string[] => {
            const cssText: string[] = [];
            const themeElement = <any>document.getElementById('theme');
            if (!themeElement || !themeElement!.sheet) {
                return cssText;
            }
            const sheet = themeElement!.sheet;
            if (sheet!.disabled || !sheet!.rules || !sheet!.rules!.length) {
                return cssText;
            }

            const nodeList = sheet!.rules;
            for (let i = 0; i < nodeList.length; i++) {
                if (nodeList[i] && nodeList[i].cssText) {
                    cssText.push(nodeList[i].cssText);
                }
            }
            return cssText;
        };
        const view = new WebviewWidget(title, {
            allowScripts: options ? options.enableScripts : false
        }, {
            onMessage: m => {
                this.proxy.$onMessage(viewId, m);
            },
            onKeyboardEvent: e => {
                this.keybindings.run(e);
            },
            onLoad: contentDocument => {
                const styleTag = contentDocument!.createElement('style');
                styleTag.type = 'text/css';
                contentDocument!.head.appendChild(styleTag);

                getThemeRules().forEach((rule: string, index: number) => {
                    if (!styleTag!.sheet!) {
                        return;
                    }
                    styleTag!.sheet!.insertRule(rule, index);
                });

                this.themeService.onThemeChange(() => {
                    for (let index = 0; index < styleTag!.sheet!.length; index++) {
                        styleTag!.sheet!.deleteRule(index);
                    }
                    getThemeRules().forEach((rule: string, index: number) => {
                        styleTag!.sheet!.insertRule(rule, index);
                    });
                });
            }
        });
        view.disposed.connect(() => {
            this.onCloseView(viewId);
        });
        this.views.set(viewId, view);
        this.shell.addWidget(view, { area: 'main' });
        this.shell.activateWidget(view.id);
    }
    $disposeWebview(handle: string): void {
        const view = this.views.get(handle);
        if (view) {
            view.dispose();
        }

    }
    $reveal(handle: string, showOptions: WebviewPanelShowOptions): void {
        throw new Error('Method not implemented.');
    }
    $setTitle(handle: string, value: string): void {
        const webview = this.getWebview(handle);
        webview.title.label = value;
    }
    $setIconPath(handle: string, value: { light: UriComponents; dark: UriComponents; } | undefined): void {
        throw new Error('Method not implemented.');
    }
    $setHtml(handle: string, value: string): void {
        const webview = this.getWebview(handle);
        webview.setHTML(value);
    }
    $setOptions(handle: string, options: WebviewOptions): void {
        throw new Error('Method not implemented.');
    }
    $postMessage(handle: string, value: any): Thenable<boolean> {
        const webview = this.getWebview(handle);
        if (webview) {
            webview.postMessage(value);
        }
        return Promise.resolve(webview !== undefined);
    }
    $registerSerializer(viewType: string): void {
        throw new Error('Method not implemented.');
    }
    $unregisterSerializer(viewType: string): void {
        throw new Error('Method not implemented.');
    }

    private getWebview(viewId: string): WebviewWidget {
        const webview = this.views.get(viewId);
        if (!webview) {
            throw new Error(`Unknown Webview: ${viewId}`);
        }
        return webview;
    }

    private onCloseView(viewId: string) {
        const cleanUp = () => {
            this.views.delete(viewId);
        };
        this.proxy.$onDidDisposeWebviewPanel(viewId).then(cleanUp, cleanUp);
    }
}
