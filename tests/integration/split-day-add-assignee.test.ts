import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, seedSchedule, type TestApp } from './helpers/setup';

/**
 * 合同回(3人1グループ)として割り当て済みの日が、急遽分級回に変わったときの再現。
 * 2026-08-16に実際に起きたケース: 分級に切り替えても2つ目のグループを作る手段がなく、
 * 4人目を記録できなかった。
 */
describe('分級に切り替えた日に担当を追加する', () => {
  let t: TestApp;
  const testYear = new Date().getFullYear() + 1;
  const month = 4;

  beforeEach(() => { t = createTestApp(); });
  afterEach(() => { t.close(); });

  /** 合同日として割り当てまで済ませ、先頭の1日だけ分級に切り替える */
  async function combinedDayThenSplit() {
    const members = await seedStandardMembers(t.request);
    const schedules = await seedSchedule(t.request, testYear, month);
    await t.request.post('/api/assignments/generate').send({ year: testYear, month }).expect(200);

    const target = schedules.filter((s) => !s.isExcluded)[0];
    await t.request.post(`/api/schedules/${target.id}/toggle-split-class`).expect(200);
    return { target, members };
  }

  /** その日にまだ割り当てられていないメンバーを1人返す */
  async function unassignedMemberOn(
    date: string,
    members: Array<{ id: string }>,
  ) {
    const groups = await groupsOn(date);
    const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));
    const found = members.find((m) => !assigned.has(m.id));
    if (!found) throw new Error('未割り当てのメンバーがいない');
    return found;
  }

  interface GroupDto {
    id: string | null;
    scheduleId: string;
    date: string;
    groupNumber: number;
    members: Array<{ id: string; name: string }>;
    vacantSlots: number;
  }

  async function groupsOn(date: string): Promise<GroupDto[]> {
    const res = await t.request
      .get(`/api/assignments?year=${testYear}&month=${month}`)
      .expect(200);
    return (res.body as GroupDto[])
      .filter((a) => a.date === date)
      .sort((a, b) => a.groupNumber - b.groupNumber);
  }

  it('分級に切り替えると、存在しないグループ2が空き枠として一覧に出る', async () => {
    const { target } = await combinedDayThenSplit();

    const groups = await groupsOn(target.date);

    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      id: null,
      groupNumber: 2,
      members: [],
      vacantSlots: 2,
      scheduleId: target.id,
      date: target.date,
    });
  });

  it('空き枠のグループに担当を追加すると、そのグループが実体になる', async () => {
    const { target, members } = await combinedDayThenSplit();
    const newMember = await unassignedMemberOn(target.date, members);

    const res = await t.request
      .post('/api/assignments/group')
      .send({ scheduleId: target.id, groupNumber: 2, memberId: newMember.id })
      .expect(201);

    expect(res.body.assignment).toMatchObject({
      groupNumber: 2,
      vacantSlots: 1,
    });
    expect(res.body.assignment.id).toBeTruthy();
    expect(res.body.assignment.members.map((m: { id: string }) => m.id)).toEqual([newMember.id]);

    const groups = await groupsOn(target.date);
    expect(groups).toHaveLength(2);
    expect(groups[1].members.map((m) => m.id)).toEqual([newMember.id]);
  });

  it('すでに存在するグループ番号を指定すると400を返す', async () => {
    const { target, members } = await combinedDayThenSplit();
    const newMember = await unassignedMemberOn(target.date, members);

    // グループ1は合同日の割り当てとして既に存在する
    await t.request
      .post('/api/assignments/group')
      .send({ scheduleId: target.id, groupNumber: 1, memberId: newMember.id })
      .expect(400);
  });

  it('過去日でも担当を追加できる(終わった回を後から記録するため)', async () => {
    const past = new Date();
    past.setMonth(past.getMonth() - 2);
    const pastYear = past.getFullYear();
    const pastMonth = past.getMonth() + 1;

    const members = await seedStandardMembers(t.request);
    const schedules = await seedSchedule(t.request, pastYear, pastMonth);
    await t.request
      .post('/api/assignments/generate')
      .send({ year: pastYear, month: pastMonth })
      .expect(200);

    const target = schedules.filter((s) => !s.isExcluded)[0];
    await t.request.post(`/api/schedules/${target.id}/toggle-split-class`).expect(200);

    const listed = await t.request
      .get(`/api/assignments?year=${pastYear}&month=${pastMonth}`)
      .expect(200);
    const onDate = (listed.body as GroupDto[]).filter((a) => a.date === target.date);
    const assigned = new Set(onDate.flatMap((g) => g.members.map((m) => m.id)));
    const newMember = members.find((m: { id: string }) => !assigned.has(m.id));

    await t.request
      .post('/api/assignments/group')
      .send({ scheduleId: target.id, groupNumber: 2, memberId: newMember!.id })
      .expect(201);
  });

  it('通し: 3人1グループから、高学年2人・低学年2人の分級編成にできる', async () => {
    const { target, members } = await combinedDayThenSplit();

    const before = await groupsOn(target.date);
    expect(before[0].members).toHaveLength(3);

    // 3人のうち1人をグループ1から外し、低学年グループへ移す
    const moved = before[0].members[2];
    await t.request
      .put(`/api/assignments/${before[0].id}/unassign`)
      .send({ memberId: moved.id })
      .expect(200);

    await t.request
      .post('/api/assignments/group')
      .send({ scheduleId: target.id, groupNumber: 2, memberId: moved.id })
      .expect(201);

    // 急遽増やした4人目を低学年グループの空き枠に入れる
    const fourth = await unassignedMemberOn(target.date, members);
    const group2 = (await groupsOn(target.date))[1];
    await t.request
      .put(`/api/assignments/${group2.id}/assign`)
      .send({ memberId: fourth.id })
      .expect(200);

    const after = await groupsOn(target.date);
    expect(after.map((g) => g.members.length)).toEqual([2, 2]);
    expect(after.every((g) => g.vacantSlots === 0)).toBe(true);
    expect(after[1].members.map((m) => m.id).sort()).toEqual([moved.id, fourth.id].sort());
  });
});
