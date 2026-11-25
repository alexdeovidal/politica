import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import queue as work_queue
import refresh


class NationalQueueTest(unittest.TestCase):
    def setUp(self):
        self.city = dict(code='3550308', uf='SP', name='São Paulo')
        self.balance = [
            dict(rotulo='Padrão', cod_conta=code, coluna=column, valor=123)
            for code, column in [
                ('ReceitasExcetoIntraOrcamentarias', 'Até o Bimestre (c)'),
                ('DespesasExcetoIntraOrcamentarias', 'DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)'),
                ('DespesasExcetoIntraOrcamentarias', 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)'),
                ('DespesasExcetoIntraOrcamentarias', 'DESPESAS PAGAS ATÉ O BIMESTRE (j)'),
            ]
        ]
        self.functions = [
            dict(rotulo='Total das Despesas Exceto Intra-Orçamentárias',
                 conta=name, coluna='DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)', valor=123)
            for name in ['Saúde', 'DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)']
        ]

    def annex(self, city, year, period, identifier):
        return (self.balance if identifier == '01' else self.functions), {'url': 'test', 'sha256': 'test'}

    @patch.object(refresh, 'TODAY', dt.date(2026, 11, 25))
    def test_first_pass_and_backfill(self):
        with patch.object(refresh, 'annex', side_effect=self.annex) as annex:
            current = refresh.fiscal(self.city, None, fast_start=True)
            self.assertEqual([r['year'] for r in current['reports']], [2026])
            self.assertEqual(annex.call_count, 2)
            full = refresh.fiscal(self.city, current)
            self.assertEqual(full['reports'][0], current['reports'][0])
            self.assertEqual([r['year'] for r in full['reports']], [2026, 2025])

    @patch.object(refresh, 'TODAY', dt.date(2026, 11, 25))
    def test_missing_current_year_uses_historical(self):
        def empty_current(city, year, period, identifier):
            if year == 2026:
                self.assertEqual(identifier, '01')
                return [], {}
            return self.annex(city, year, period, identifier)

        with patch.object(refresh, 'annex', side_effect=empty_current):
            historical = refresh.fiscal(self.city, None, fast_start=True)
            self.assertEqual([r['year'] for r in historical['reports']], [2025])

    def test_unpublished_first(self):
        new = dict(code='3304557', uf='RJ', name='Rio de Janeiro')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '3550308-fiscal.json').write_text(json.dumps({'reports': []}))
            with patch.object(work_queue, 'candidates', return_value=[self.city, new]), \
                    patch.object(refresh, 'fiscal', return_value={'reports': []}) as fiscal, \
                    patch.object(refresh, 'replace'):
                self.assertEqual(work_queue.run(root, 1, 30, None), 0)
                fiscal.assert_called_once_with(new, None, fast_start=True)


if __name__ == '__main__':
    unittest.main()
