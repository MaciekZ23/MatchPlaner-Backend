import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto, UpdateTournamentDto } from './dto/tournament.dto';
import { Roles } from 'src/auth/roles.decorator';
import { Public } from 'src/auth/public.decorator';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';

@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly service: TournamentsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Public()
  @Version('1')
  @Get()
  getAll() {
    return this.service.findAll();
  }

  @Public()
  @Version('1')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Version('1')
  @Roles('ADMIN')
  @Post('create-tournament')
  create(@Body() dto: CreateTournamentDto) {
    return this.service.create(dto);
  }

  @Version('1')
  @Roles('ADMIN')
  @Patch(':id/modify-tournament')
  update(@Param('id') id: string, @Body() dto: UpdateTournamentDto) {
    return this.service.update(id, dto);
  }

  @Version('1')
  @Roles('ADMIN')
  @Delete(':id/delete-tournament')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post(':id/upload-venue')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async uploadVenueImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const uploaded = await this.cloudinary.uploadImage(file);

    return this.service.update(id, {
      venueImageUrl: (uploaded as any).secure_url,
    });
  }
}
