import React, { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  ActorSchema,
  type Actor,
  type Item,
  type Skill,
  type Enemy,
} from '@rpgstudio/core';

export interface DatabaseEditorProps {
  readonly actors: readonly Actor[];
  readonly items: readonly Item[];
  readonly skills: readonly Skill[];
  readonly enemies: readonly Enemy[];
  readonly onUpsertActor: (actor: Actor) => void;
  readonly onDeleteActor: (id: string | number) => void;
  readonly onUpsertItem: (item: Item) => void;
  readonly onDeleteItem: (id: string | number) => void;
}

export const DatabaseEditor: React.FC<DatabaseEditorProps> = ({
  actors,
  items,
  skills,
  enemies,
  onUpsertActor,
  onDeleteActor,
  onUpsertItem: _onUpsertItem,
  onDeleteItem,
}) => {
  const [tab, setTab] = useState<number>(0);
  const [openActorDialog, setOpenActorDialog] = useState<boolean>(false);
  const [actorName, setActorName] = useState<string>('');
  const [actorHp, setActorHp] = useState<number>(100);
  const [actorAtk, setActorAtk] = useState<number>(15);
  const [actorError, setActorError] = useState<string | null>(null);

  const handleSaveActor = () => {
    const rawActor = {
      id: `actor-${Date.now()}`,
      name: actorName.trim(),
      classId: 1,
      level: 1,
      maxLevel: 99,
      exp: 0,
      stats: {
        hp: actorHp,
        maxHp: actorHp,
        mp: 20,
        maxMp: 20,
        attack: actorAtk,
        defense: 10,
        mAttack: 10,
        mDefense: 10,
        agility: 10,
        luck: 10,
      },
      equips: {},
      sprite: {
        characterSheet: 'Actor1.png',
        characterIndex: 0,
      },
    };

    const result = ActorSchema.safeParse(rawActor);
    if (!result.success) {
      setActorError(result.error.issues[0]?.message ?? 'Invalid actor data');
      return;
    }

    onUpsertActor(result.data);
    setOpenActorDialog(false);
    setActorName('');
    setActorError(null);
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
        Database Editor
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab label={`Actors (${actors.length})`} />
          <Tab label={`Items (${items.length})`} />
          <Tab label={`Skills (${skills.length})`} />
          <Tab label={`Enemies (${enemies.length})`} />
        </Tabs>
      </Box>

      {/* Actors Tab */}
      {tab === 0 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setActorError(null);
                setOpenActorDialog(true);
              }}
            >
              Add Actor
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>HP</TableCell>
                  <TableCell>MP</TableCell>
                  <TableCell>Attack</TableCell>
                  <TableCell>Defense</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {actors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      No actors created yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  actors.map((actor) => (
                    <TableRow key={String(actor.id)}>
                      <TableCell>{actor.id}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{actor.name}</TableCell>
                      <TableCell>{actor.level}</TableCell>
                      <TableCell>{actor.stats.hp} / {actor.stats.maxHp}</TableCell>
                      <TableCell>{actor.stats.mp} / {actor.stats.maxMp}</TableCell>
                      <TableCell>{actor.stats.attack}</TableCell>
                      <TableCell>{actor.stats.defense}</TableCell>
                      <TableCell align="right">
                        <Button
                          color="error"
                          size="small"
                          startIcon={<DeleteIcon />}
                          onClick={() => onDeleteActor(actor.id)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Items Tab */}
      {tab === 1 && (
        <Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Effects</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No items defined.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={String(item.id)}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{item.name}</TableCell>
                      <TableCell>{item.itemType}</TableCell>
                      <TableCell>{item.price} G</TableCell>
                      <TableCell>{item.effects.map((e) => `${e.code}: ${e.value1}`).join(', ')}</TableCell>
                      <TableCell align="right">
                        <Button
                          color="error"
                          size="small"
                          startIcon={<DeleteIcon />}
                          onClick={() => onDeleteItem(item.id)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Skills Tab */}
      {tab === 2 && (
        <Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>MP Cost</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Formula</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {skills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No skills defined.
                    </TableCell>
                  </TableRow>
                ) : (
                  skills.map((skill) => (
                    <TableRow key={String(skill.id)}>
                      <TableCell>{skill.id}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{skill.name}</TableCell>
                      <TableCell>{skill.mpCost}</TableCell>
                      <TableCell>{skill.scope}</TableCell>
                      <TableCell>{skill.damage.formula}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Enemies Tab */}
      {tab === 3 && (
        <Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>HP</TableCell>
                  <TableCell>Attack</TableCell>
                  <TableCell>Defense</TableCell>
                  <TableCell>EXP</TableCell>
                  <TableCell>Gold</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {enemies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No enemies defined.
                    </TableCell>
                  </TableRow>
                ) : (
                  enemies.map((enemy) => (
                    <TableRow key={String(enemy.id)}>
                      <TableCell>{enemy.id}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{enemy.name}</TableCell>
                      <TableCell>{enemy.stats.hp}</TableCell>
                      <TableCell>{enemy.stats.attack}</TableCell>
                      <TableCell>{enemy.stats.defense}</TableCell>
                      <TableCell>{enemy.expReward}</TableCell>
                      <TableCell>{enemy.goldReward} G</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Add Actor Dialog */}
      <Dialog open={openActorDialog} onClose={() => setOpenActorDialog(false)}>
        <DialogTitle>Add New Actor</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1, minWidth: 320 }}>
          {actorError && <Alert severity="error">{actorError}</Alert>}
          <TextField
            label="Actor Name"
            value={actorName}
            onChange={(e) => setActorName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Max HP"
            type="number"
            value={actorHp}
            onChange={(e) => setActorHp(Number(e.target.value))}
            fullWidth
          />
          <TextField
            label="Attack"
            type="number"
            value={actorAtk}
            onChange={(e) => setActorAtk(Number(e.target.value))}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenActorDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveActor} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
