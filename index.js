function pipeLogsToTerminal() {
  let oldConsoleWarn;
  let oldConsoleError;
  let logs = [];

  Cypress.on('window:before:load', () => {
    const docIframe = window.parent.document.querySelector("[id*='Your App']");
    const appWindow = docIframe.contentWindow;

    oldConsoleWarn = appWindow.console.warn;
    oldConsoleError = appWindow.console.error;

    appWindow.console.warn = (...args) => {
      logs.push(['warn', args.join(' ')]);
      oldConsoleWarn(...args);
    };
    appWindow.console.error = (...args) => {
      logs.push(['error', args.join(' ')]);
      oldConsoleError(...args);
    };
  });

  Cypress.Commands.overwrite('log', (subject, ...args) => {
    logs.push(['cy:log', args.join(' ')]);
    subject(...args);
  });

  Cypress.on('log:added', options => {
    if (options.instrument === 'command' && options.consoleProps) {
      if (options.name === 'log' || (options.name === 'task' && options.message.match(/terminalLogs/))) {
        return;
      }
      let detailMessage = '';
      if (options.name === 'xhr') {
        detailMessage = (options.consoleProps.Stubbed === 'Yes' ? 'STUBBED ' : '') + options.consoleProps.Method + ' ' + options.consoleProps.URL;
      }
      const log = options.name + '\t' + options.message + (detailMessage !== '' ? ' ' + detailMessage : '');
      logs.push(['cy:command', log])
    }
  });

  Cypress.Commands.overwrite("server", (originalFn, options = {}) => {
    const prevCallback = (options ? options.onAnyResponse : null) || (() => {});
    options.onAnyResponse = async (route, xhr) => {
      if (prevCallback) {
        prevCallback(route, xhr);
      }

      if (!route) {
        return;
      }

      const response = typeof xhr.response.body === "string" ? xhr.response.body : JSON.stringify(xhr.response.body);
      logs.push([String(xhr.status).match(/^2[0-9]+$/) ? 'cy:route:info' : 'cy:route:warn',
        `Status: ${xhr.status} (${route.alias})\n\t\tMethod: ${xhr.method}\n\t\tUrl: ${xhr.url}\n\t\tResponse: ${response}`]);
    };

    originalFn(options);
  });

  Cypress.mocha.getRunner().on('test', () => {
    logs = [];
  });

  afterEach(function () {
    if (this.currentTest.state !== 'passed') {
      cy.task('terminalLogs', logs);
    }
  });
}

function nodeAddLogsPrinter(on, options = {}) {
  const chalk = require('chalk');

  on('task', {
    terminalLogs: (messages) => {
      messages.forEach(([type, message], i) => {
        let color = 'white',
          typeString = '       [unknown] ',
          processedMessage = message,
          trim = options.defaultTrimLength || 200,
          icon = '-';

        if (type === 'warn') {
          color = 'yellow';
          typeString = '       cons.warn ';
          icon = '⚠';
        } else if (type === 'error') {
          color = 'red';
          typeString = '      cons.error ';
          icon = '⚠';
        } else if (type === 'cy:log') {
          color = 'green';
          typeString = '          cy:log ';
          icon = 'ⓘ';
        } else if (type === 'cy:command') {
          typeString = '      cy:command ';
          color = 'green';
          icon = '✔';
          trim = options.commandTrimLength || 600;
        } else if (type === 'cy:route:info') {
          typeString = '        cy:route ';
          color = 'green';
          icon = '⛗';
          trim = options.routeTrimLength || 5000;
        } else if (type === 'cy:route:warn') {
          typeString = '        cy:route ';
          color = 'yellow';
          icon = '⛗';
          trim = options.routeTrimLength || 5000;
        }

        if (i === messages.length - 1) {
          color = 'red';
          icon = '✘'
        }

        if (message.length > trim) {
          processedMessage = message.substring(0, trim) + " ...";
        }

        console.log(chalk[color](typeString + icon + ' '), processedMessage);
      });

      console.log('\n\n');
      return null;
    },
  });
}

module.exports = {
  /**
   * Installs the cypress plugin for printing logs to terminal.
   *
   * Needs to be added to plugins file.
   *
   * @param {Function} on
   *    Cypress event listen handler.
   * @param {object} options
   *    Options for displaying output:
   *      - defaultTrimLength?: Trim length for console and cy.log.
   *      - commandTrimLength?: Trim length for cy commands.
   */
  installPlugin: (on, options= {}) =>
    nodeAddLogsPrinter(on, options),

  /**
   * Installs the logs collector for cypress.
   *
   * Needs to be added to support file.
   */
  installSupport: () =>
    pipeLogsToTerminal(),
};
