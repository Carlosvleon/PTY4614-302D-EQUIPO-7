import { Logger } from '@nestjs/common';
import { logBillingTrace, safePretty } from './billing-trace-log';

describe('billing-trace-log', () => {
  it('redacta Authorization y no mezcla los tres bloques', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const logger = new Logger('test');

    logBillingTrace(logger, 'inbound', { documentoId: 'D1' });
    logBillingTrace(logger, 'outbound', { Authorization: 'Basic secreto', FileContent: '<xml/>' });
    logBillingTrace(logger, 'response', { Success: false }, { rejected: true });

    expect(log.mock.calls).toHaveLength(2);
    expect(warn.mock.calls).toHaveLength(1);
    expect(String(log.mock.calls[0][0])).toContain('BILLING INBOUND');
    expect(String(log.mock.calls[1][0])).toContain('GOSOCKET OUTBOUND');
    expect(String(warn.mock.calls[0][0])).toContain('GOSOCKET RESPONSE');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secreto');
    expect(JSON.stringify(log.mock.calls[1])).toContain('[REDACTED]');
    log.mockRestore();
    warn.mockRestore();
  });

  it('pretty-print acota tamaño', () => {
    const huge = { n: 'x'.repeat(90_000) };
    const text = safePretty(huge);
    expect(text).toContain('truncated');
    expect(text.length).toBeLessThan(90_000);
  });
});
