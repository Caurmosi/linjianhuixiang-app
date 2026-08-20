/**
 * shareCard.test.js —— 分享卡片数据层纯函数测试（buildShareCardData / gradeColor）
 * 说明：drawShareCard 依赖 canvas/document，浏览器环境才能跑，此处只测纯数据组织。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareCardData, gradeColor } from '../src/utils/shareCard.js';

describe('gradeColor 等级色', () => {
  test('≥70 绿 / ≥50 琥珀 / <50 红', () => {
    assert.equal(gradeColor(70), '#2e7d52');
    assert.equal(gradeColor(85), '#2e7d52');
    assert.equal(gradeColor(50), '#d49a26');
    assert.equal(gradeColor(64), '#d49a26');
    assert.equal(gradeColor(49), '#c0392b');
    assert.equal(gradeColor(0), '#c0392b');
  });
});

describe('buildShareCardData 数据组织', () => {
  test('按置信度排序取 Top3，物种名列表保留全部', () => {
    const analysis = {
      recording: '苏堤_晨.wav',
      createdAt: '2026-08-20T08:30:00',
      livability: { score: 76, grade: '宜居', gradeEn: 'Good', bio: 82, sound: 70, noise: 28 },
      species: [
        { name: '麻雀', conf: 0.6 },
        { name: '乌鸫', conf: 0.9 },
        { name: '白头鹎', conf: 0.8 },
        { name: '珠颈斑鸠', conf: 0.5 },
        { name: '家燕', conf: 0.4 },
      ],
    };
    const d = buildShareCardData(analysis);
    assert.equal(d.title, '苏堤_晨.wav');
    assert.equal(d.score, 76);
    assert.equal(d.grade, '宜居');
    assert.deepEqual(d.topSpecies.map((s) => s.name), ['乌鸫', '白头鹎', '麻雀'], 'Top3 按置信度降序');
    assert.equal(d.speciesNames.length, 5, '文字列表保留全部');
    assert.equal(d.bio, 82);
    assert.equal(d.noise, 28);
  });

  test('缺失 livability / species 时兜底不报错', () => {
    const d = buildShareCardData({ recording: '空录音.wav' });
    assert.equal(d.score, 0);
    assert.deepEqual(d.topSpecies, []);
    assert.deepEqual(d.speciesNames, []);
    assert.equal(d.bio, null);
    assert.equal(d.noise, null);
  });

  test('species 缺失时 topSpecies 为空', () => {
    const d = buildShareCardData({ recording: 'x', livability: { score: 55 } });
    assert.equal(d.score, 55);
    assert.equal(d.grade, '一般');
    assert.deepEqual(d.topSpecies, []);
  });
});
