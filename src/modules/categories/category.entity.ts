import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity.js';

@Entity('categories')
@Index('idx_categories_parent', ['parentId'])
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Index('uq_categories_slug', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  imageStorageKey: string | null;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'parent_id',
    foreignKeyConstraintName: 'fk_categories_parent',
  })
  parent?: Relation<Category> | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
