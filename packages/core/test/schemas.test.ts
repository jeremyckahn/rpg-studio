import { describe, expect, it } from 'vitest';
import {
  ActorSchema,
  ClassSchema,
  EnemySchema,
  EventPageSchema,
  ItemSchema,
  SaveStateSchema,
  SkillSchema,
  TilemapSchema,
} from '../src/index.js';

describe('Zod Schemas & Strict JSON Validation', () => {
  describe('ActorSchema', () => {
    it('validates a valid actor JSON payload', () => {
      const validActor = {
        id: 'hero-1',
        name: 'Alex',
        nickname: 'The Brave',
        classId: 1,
        level: 1,
        maxLevel: 99,
        exp: 0,
        stats: {
          hp: 100,
          maxHp: 100,
          mp: 20,
          maxMp: 20,
          attack: 15,
          defense: 12,
          mAttack: 10,
          mDefense: 8,
          agility: 14,
          luck: 10,
        },
        equips: {
          weapon: 'iron-sword',
          shield: 'wooden-shield',
        },
        sprite: {
          characterSheet: 'Actor1.png',
          characterIndex: 0,
          faceSheet: 'Actor1_Face.png',
          faceIndex: 0,
        },
        profile: 'A brave adventurer setting forth into the unknown.',
      };

      const result = ActorSchema.safeParse(validActor);
      expect(result.success).toBe(true);
    });

    it('rejects hallucinated AI fields via strict mode', () => {
      const hallucinatedActor = {
        id: 'hero-2',
        name: 'Mage',
        classId: 2,
        level: 1,
        exp: 0,
        stats: {
          hp: 80,
          maxHp: 80,
          mp: 50,
          maxMp: 50,
          attack: 8,
          defense: 6,
          mAttack: 22,
          mDefense: 18,
          agility: 10,
          luck: 12,
        },
        sprite: {
          characterSheet: 'Actor2.png',
          characterIndex: 1,
        },
        extraHallucinatedSkillPoints: 9999, // Unrecognized field
      };

      const result = ActorSchema.safeParse(hallucinatedActor);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
      }
    });

    it('rejects invalid stat values like negative HP', () => {
      const invalidActor = {
        id: 'hero-3',
        name: 'Ghost',
        classId: 1,
        level: 1,
        exp: 0,
        stats: {
          hp: -10,
          maxHp: 100,
          mp: 0,
          maxMp: 0,
          attack: 10,
          defense: 10,
          mAttack: 10,
          mDefense: 10,
          agility: 10,
          luck: 10,
        },
        sprite: {
          characterSheet: 'Actor1.png',
          characterIndex: 0,
        },
      };

      const result = ActorSchema.safeParse(invalidActor);
      expect(result.success).toBe(false);
    });
  });

  describe('ClassSchema', () => {
    it('validates a valid class definition', () => {
      const validClass = {
        id: 1,
        name: 'Warrior',
        expCurve: { base: 30, multiplier: 1.5 },
        statGrowths: {
          maxHp: 20,
          maxMp: 5,
          attack: 4,
          defense: 3,
          mAttack: 1,
          mDefense: 1,
          agility: 2,
          luck: 1,
        },
        learnableSkills: [
          { level: 1, skillId: 1 },
          { level: 5, skillId: 2 },
        ],
      };

      expect(ClassSchema.safeParse(validClass).success).toBe(true);
    });
  });

  describe('ItemSchema & SkillSchema', () => {
    it('validates consumable items and effects', () => {
      const potion = {
        id: 'potion-1',
        name: 'Small Potion',
        description: 'Restores 50 HP.',
        iconIndex: 12,
        itemType: 'consumable',
        price: 50,
        consumable: true,
        effects: [
          { code: 'recover_hp', value1: 50 },
        ],
      };

      expect(ItemSchema.safeParse(potion).success).toBe(true);
    });

    it('validates skill with formula and scope', () => {
      const fireball = {
        id: 'skill-fireball',
        name: 'Fireball',
        description: 'Engulfs target in flames.',
        iconIndex: 64,
        mpCost: 12,
        scope: 'one_enemy',
        speed: 0,
        damage: {
          type: 'magical',
          formula: 'a.mAttack * 3 - b.mDefense * 1.5',
        },
        animationId: 5,
      };

      expect(SkillSchema.safeParse(fireball).success).toBe(true);
    });
  });

  describe('EnemySchema', () => {
    it('validates enemy with drops and AI action conditions', () => {
      const goblin = {
        id: 'enemy-goblin',
        name: 'Goblin Scout',
        battlerName: 'GoblinScout.png',
        stats: {
          hp: 45,
          maxHp: 45,
          mp: 0,
          maxMp: 0,
          attack: 12,
          defense: 8,
          mAttack: 4,
          mDefense: 5,
          agility: 11,
          luck: 7,
        },
        expReward: 15,
        goldReward: 22,
        dropItems: [
          { itemId: 'potion-1', chance: 0.25 },
        ],
        actions: [
          { skillId: 'skill-attack', rating: 5, condition: 'always' },
        ],
      };

      expect(EnemySchema.safeParse(goblin).success).toBe(true);
    });
  });

  describe('TilemapSchema', () => {
    it('validates a valid tilemap with matching layer array size', () => {
      const tilemap = {
        id: 1,
        name: 'Starter Town',
        width: 3,
        height: 2,
        tileSize: 32,
        tilesetId: 'overworld-1',
        layers: [
          {
            id: 'ground',
            name: 'Ground',
            visible: true,
            opacity: 1,
            data: [1, 1, 1, 1, 1, 1], // 3 * 2 = 6
          },
        ],
        collision: [0, 0, 1, 0, 0, 0], // 6 flags
        events: [],
      };

      expect(TilemapSchema.safeParse(tilemap).success).toBe(true);
    });

    it('rejects tilemap when layer data length does not match width * height', () => {
      const invalidTilemap = {
        id: 1,
        name: 'Starter Town',
        width: 3,
        height: 2,
        tileSize: 32,
        tilesetId: 'overworld-1',
        layers: [
          {
            id: 'ground',
            name: 'Ground',
            visible: true,
            opacity: 1,
            data: [1, 1, 1], // only 3 items, expects 6
          },
        ],
        collision: [0, 0, 0, 0, 0, 0],
        events: [],
      };

      const result = TilemapSchema.safeParse(invalidTilemap);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('must match map area width * height');
      }
    });
  });

  describe('EventCommandSchema & EventPageSchema', () => {
    it('validates linear and nested conditional event command lists', () => {
      const eventPage = {
        id: 1,
        conditions: { switch1Id: 'game_started' },
        graphic: { characterSheet: 'NPC1.png', characterIndex: 2, direction: 'down' },
        trigger: 'action_button',
        list: [
          { command: 'ShowText', speakerName: 'Elder', text: 'Beware the woods!' },
          { command: 'PlaySE', name: 'Chime.ogg', volume: 80, pitch: 100, pan: 0 },
          {
            command: 'ConditionalBranch',
            condition: { type: 'switch', id: 'has_sword', value: true },
            thenCommands: [
              { command: 'ShowText', speakerName: 'Elder', text: 'I see you are armed.' },
              { command: 'TransferPlayer', mapId: 'woods-1', x: 5, y: 10, direction: 'up' },
            ],
            elseCommands: [
              { command: 'ShowText', speakerName: 'Elder', text: 'You need a weapon first.' },
            ],
          },
          { command: 'SetSwitch', switchId: 'talked_to_elder', value: true },
          { command: 'Wait', frames: 30 },
        ],
      };

      const result = EventPageSchema.safeParse(eventPage);
      expect(result.success).toBe(true);
    });
  });

  describe('SaveStateSchema', () => {
    it('validates complete game state serialization', () => {
      const saveState = {
        version: '1.0.0',
        timestamp: Date.now(),
        playTime: 3600,
        mapId: 'map-overworld',
        player: {
          x: 14,
          y: 22,
          direction: 'down',
          actorId: 'alex',
        },
        actors: [
          {
            id: 'alex',
            name: 'Alex',
            classId: 1,
            level: 5,
            maxLevel: 99,
            exp: 1200,
            stats: {
              hp: 150,
              maxHp: 150,
              mp: 30,
              maxMp: 30,
              attack: 25,
              defense: 18,
              mAttack: 12,
              mDefense: 10,
              agility: 16,
              luck: 12,
            },
            equips: {},
            sprite: { characterSheet: 'Actor1.png', characterIndex: 0 },
          },
        ],
        switches: { quest_active: true },
        variables: { quest_step: 3 },
        selfSwitches: { 'map-1_event-2_A': true },
        inventory: [{ itemId: 'potion-1', count: 5 }],
        gold: 350,
      };

      const result = SaveStateSchema.safeParse(saveState);
      expect(result.success).toBe(true);
    });
  });
});
