import { NextRequest, NextResponse } from 'next/server';
import prisma from '../db';
import { MortalityStatusEnum, UserRoleEnum } from '@prisma/client';
import passwordUtils from '@/utils/shared/passwordUtils';

const COST_PER_DAY = 19000;

export async function POST(req: NextRequest) {
  try {


    const formData = await req.formData();
    // Check if formData is empty
    if (formData.entries().next().done) {
      return new NextResponse("END No data submitted");
    }
    const sessionId = formData.get('sessionId') as string;
    const serviceCode = formData.get('serviceCode') as string;
    const phoneNumber = formData.get('phoneNumber') as string;
    const text = formData.get('text') as string;

    // Check for required fields
    if (!phoneNumber) {
      return new NextResponse("END Phone number is missing");
    }

    const safeText = text || '';

    let response = '';
    const textArray = safeText.split('*');
    const level = textArray.length;

    const cleanPhoneNumber = phoneNumber.slice(-9);

    // Check if the user exists by phone number
    const users = await prisma.user.findMany({
      include: { relative: true },
    });

    let user = users.find(u => u.relative?.tel.slice(-9) === cleanPhoneNumber) || null;



    if (!user) {
      switch (level) {
        case 1:
          response = 'CON Welcome to Morgue Management System. You are not registered yet. Would you like to register?\n';
          response += '1. Yes\n';
          response += '2. No';
          break;
        case 2:
          if (textArray[1] === '1') {
            response = 'CON Please enter your full name:';
          } else {
            response = 'END Thank you for using our service. Goodbye!';
          }
          break;
        case 3:
          response = 'CON Please enter your email address:';
          break;
        case 4:
          response = 'CON Please enter your National ID number:';
          break;
        case 5:
          response = 'CON Please enter your location:';
          break;
        case 6:
          // Create the user
          const [names, email, nid, location] = textArray.slice(2);
          const password = Math.random().toString(36).slice(-8); // Generate a random password

          try {
            user = await prisma.user.create({
              data: {
                names,
                email,
                role: UserRoleEnum.RELATIVE,
                location,
                password: await passwordUtils.encryptPassword(password),
                relative: {
                  create: {
                    tel: phoneNumber,
                    nid,
                  },
                }
              },
              include: { relative: true },
            });

            response = `END Registration successful! Your temporary password is: ${password}\n`;
            response += 'Please change your password after logging in at https://morgue-management-system.vercel.app/';
          } catch (error) {
            response = 'END Registration failed. Please try again later or register on our website.';
          }
          break;
        default:
          response = 'END Invalid input. Please try again.';
      }
    } else {
      switch (level) {
        case 1:
          response = 'CON Welcome to Morgue Management System. What would you like to do?\n';
          response += '1. Start a new claim\n';
          response += '2. View claim history';
          break;

        case 2:
          if (textArray[1] === '1') {
            response = 'CON Choose hospital where your deceased one is at:\n';
            const hospitals = await prisma.hospital.findMany({ include: { user: true } });
            hospitals.forEach((h, idx) => {
              response += `${idx + 1}. ${h.user.names} - ${h.user.location}\n`;
            })
          } else if (textArray[1] === '2') {
            const claims = await prisma.claim.findMany({
              where: { relativeId: user.relative!.id },
              include: { mortality: true },
              orderBy: { pickUpDate: 'desc' },
            });
            if (claims.length > 0) {
              response = 'END Your claim history:\n';
              claims.forEach((claim, index) => {
                const formattedDate = claim.pickUpDate.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                });
                response += `${index + 1}. ${claim.mortality.firstName} ${claim.mortality.lastName} - ${claim.amount} RWF - ${formattedDate}\n`;
              });
            } else {
              response = 'END You have no claim history.';
            }
          }
          break;

        case 3:
          if (textArray[1] === '1') {
            response = 'CON Please enter the National ID of the deceased:';
          }
          break;
        case 4:
          if (textArray[1] === '1') {
            const nid = textArray[3];
            const mortality = await prisma.mortality.findFirst({
              where: { nid },
            });
            if (mortality && mortality.status === MortalityStatusEnum.UNCLAIMED) {
              const currentDate = new Date();
              const registeredDate = new Date(mortality.registeredOn);
              const daysPassed = Math.ceil((currentDate.getTime() - registeredDate.getTime()) / (1000 * 60 * 60 * 24));
              const totalCost = daysPassed * COST_PER_DAY;
              response = `CON Deceased found: ${mortality.firstName} ${mortality.lastName}\n`;
              response += `Total cost: ${totalCost} RWF\n`;
              response += 'Enter your relationship to the deceased:';
            }
            else if (mortality) {
              response = 'END Deceased found with that National ID but is already claimed.';
            }
            else {
              response = 'END No unclaimed deceased found with that National ID.';
            }
          }
          break;

        case 5:
          if (textArray[1] === '1') {
            response = 'CON Enter your MOMO number:';
          }
          break;

        case 6:
          if (textArray[1] === '1') {
            response = 'CON Enter pickup date (YYYY-MM-DD):';
          }
          break;

        case 7:
          if (textArray[1] === '1') {
            response = 'CON Enter pickup time (HH:MM, 24-hour format):';
          }
          break;

        case 8:
          if (textArray[1] === '1') {
            const nid = textArray[3];
            const relationship = textArray[4];
            const method = textArray[5];
            const pickUpDate = textArray[6];
            const pickUpTime = textArray[7];
            const pickUpDateTime = new Date(`${pickUpDate}T${pickUpTime}:00`);
            if (isNaN(pickUpDateTime.getTime())) {
              response = 'END Invalid date or time format. Please start over and use the correct format.';
            }
            else {

              const mortality = await prisma.mortality.findFirst({
                where: { nid, status: 'UNCLAIMED' },
              });
              if (mortality) {
                const currentDate = new Date();
                const registeredDate = new Date(mortality.registeredOn);
                const daysPassed = Math.ceil((currentDate.getTime() - registeredDate.getTime()) / (1000 * 60 * 60 * 24));
                const totalCost = daysPassed * COST_PER_DAY;
                await prisma.claim.create({
                  data: {
                    relativeId: user.relative!.id,
                    mortalityId: mortality.id,
                    relationship,
                    amount: totalCost,
                    method,
                    paidAt: new Date(),
                    pickUpDate: pickUpDateTime,
                  },
                });
                await prisma.mortality.update({
                  where: { id: mortality.id },
                  data: { status: 'CLAIMED' },
                });
                response = `END Your claim has been submitted successfully. Total cost: ${totalCost} RWF. Be ready at pickup date.`;
              } else {
                response = 'END An error occurred. Please try again later.';
              }
            }
          }
          break;

        default:
          response = 'END Invalid input. Please try again.';
      }
    }

    return new NextResponse(response);
  }
  catch (error: any) {
    return new NextResponse(`Morgue MIS Error: ${error.message}`);
  }
}
